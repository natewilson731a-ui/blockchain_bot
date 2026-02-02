import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Text,
  VStack,
  useColorModeValue,
  Icon,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  Divider,
  useToast,
  Tag as Badge,
  InputGroup,
  InputRightElement,
  HStack,
  Center,
  UnorderedList,
  ListItem,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useBreakpointValue,
  Show,
  Hide,
  useColorMode,
  Switch,
  Tooltip,
  MenuDivider,
  RadioGroup,
  Radio
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { InfoIcon, AddIcon, CheckIcon, TimeIcon, CloseIcon, WarningIcon, HamburgerIcon, MoonIcon, SunIcon } from '@chakra-ui/icons';
import axios from 'axios';
import { getContract, getElectionResult, getContestants, getElectionStatus, getVoterStatus, castVote, debugElectionTiming } from '../utils/web3';
import type { Contract as Web3Contract } from 'web3-eth-contract';
import Web3 from 'web3';

interface RegistrationStatus {
  status: 'not_registered' | 'pending' | 'approved' | 'rejected';
  registrationTime?: string;
}

interface ElectionStatus {
  id: number;
  name?: string;
  status: 'CREATED' | 'ACTIVE' | 'ENDED';
  startedAt?: string;
  scheduledEndTime?: string;
  durationMinutes?: number;
  isActive: boolean;
}

interface VoterStatus {
  isRegistered: boolean;
  isPending: boolean;
  isApproved: boolean;
  registrationTime: number;
  hasVoted: boolean;
  totalVoters: number;
}

interface Contestant {
  id: number;
  name: string;
  age: number;
  cnic: string;
  qualification: string;
  voteCount: number;
}

interface ElectionData {
  id: number;
  status: 'CREATED' | 'ACTIVE' | 'ENDED';
  startedAt?: string;
  scheduledEndTime?: string;
  durationMinutes?: number;
  isActive: boolean;
  contestants: Contestant[];
  totalVoters: number;
}

interface CompletedElection {
  id: number;
  name?: string;
  status: string;
  startedAt: string;
  endedAt: string;
  scheduledEndTime?: string;
  totalVoters: number;
  totalVotes: number;
  turnoutPercentage: string;
  winner: {
    status: 'draw' | 'decided';
    contestant?: {
      id: number;
      name: string;
      voteCount: number;
      percentage: string;
    };
  };
  contestants: Array<{
    id: number;
    name: string;
    voteCount: number;
    percentage: string;
  }>;
}

const VoterRegistrationStatus: React.FC<{ user: any }> = ({ user }) => {
  const getStatusInfo = () => {
    if (!user) return { status: 'loading', text: 'Loading...', color: 'gray' };
    
    if (user.pendingVoter && user.pendingVoter.isApproved) {
      return {
        status: 'approved',
        text: 'Voter Registration Approved',
        color: 'green',
        icon: CheckIcon
      };
    }
    
    if (user.pendingVoter && !user.pendingVoter.isApproved) {
      return {
        status: 'pending',
        text: 'Voter Registration Pending Approval',
        color: 'orange',
        icon: TimeIcon
      };
    }
    
    return {
      status: 'not_registered',
      text: 'Not Registered as Voter',
      color: 'gray',
      icon: WarningIcon
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <Card
      w="full"
      bg={useColorModeValue('white', 'gray.800')}
      boxShadow="sm"
      rounded="lg"
      p={4}
    >
      <CardHeader pb={2}>
        <Heading size="sm">Voter Registration Status</Heading>
      </CardHeader>
      <CardBody pt={0}>
        <HStack spacing={3}>
          <Icon as={statusInfo.icon} color={`${statusInfo.color}.500`} boxSize={5} />
          <Text color={`${statusInfo.color}.500`} fontWeight="medium">
            {statusInfo.text}
          </Text>
        </HStack>
        {statusInfo.status === 'pending' && (
          <Alert status="info" mt={3} size="sm" rounded="md">
            <AlertIcon />
            Your registration is being reviewed by an admin. You'll be notified once it's approved.
          </Alert>
        )}
        {statusInfo.status === 'not_registered' && (
          <Alert status="warning" mt={3} size="sm" rounded="md">
            <AlertIcon />
            You need to register as a voter to participate in the election. Please complete the voter registration form.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
};

const UserDashboard: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [activeSection, setActiveSection] = useState('information');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    walletAddress: '',
    cnic: '',
  });
  const [registrationError, setRegistrationError] = useState('');
  const [electionPhase, setElectionPhase] = useState<'registration' | 'voting' | 'result' | null>(null);
  const [electionResult, setElectionResult] = useState<{
    isResultDeclared: boolean;
    winnerId: number;
    winnerName: string;
    winnerVotes: number;
  } | null>(null);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [selectedContestant, setSelectedContestant] = useState<string>('');
  const [isVoting, setIsVoting] = useState(false);
  const [votingError, setVotingError] = useState('');
  const [electionStatus, setElectionStatus] = useState<ElectionStatus | null>(null);
  const [isRegistrationPhaseActive, setIsRegistrationPhaseActive] = useState(false);
  const [voterStatus, setVoterStatus] = useState<VoterStatus | null>(null);
  const [contract, setContract] = useState<Web3Contract | null>(null);
  const [formData, setFormData] = useState({
    dateOfBirth: '',
    phoneNumber: '',
    address: '',
    city: '',
    cnic: '',
  });
  const [showRegistrationForm, setShowRegistrationForm] = useState(true);
  const [approvedVotersCount, setApprovedVotersCount] = useState<number>(0);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [electionDataLoaded, setElectionDataLoaded] = useState(false);
  const [completedElections, setCompletedElections] = useState<CompletedElection[]>([]);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [votingDetails, setVotingDetails] = useState<any[]>([]);
  const [isLoadingVotingDetails, setIsLoadingVotingDetails] = useState(false);
  
  const navigate = useNavigate();
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();
  const textColor = useColorModeValue('gray.600', 'gray.300');
  const readOnlyBg = useColorModeValue('gray.50', 'gray.700');
  
  // Additional color mode values for enhanced result section
  const resultTextColor = useColorModeValue('gray.800', 'white');
  const resultMutedTextColor = useColorModeValue('gray.600', 'gray.400');
  const resultCardBg = useColorModeValue('white', 'gray.700');
  const resultHeaderBg = useColorModeValue('blue.50', 'blue.900');
  const resultWinnerAlertBg = useColorModeValue('green.50', 'green.900');
  const resultWinnerBorderColor = useColorModeValue('green.200', 'green.600');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/');
  };

  const NavItem = ({ icon, children, section }: { icon: React.ElementType; children: React.ReactNode; section: string }) => {
    return (
      <Button
        leftIcon={<Icon as={icon} />}
        w="full"
        variant={activeSection === section ? "solid" : "ghost"}
        colorScheme={activeSection === section ? "cyan" : "gray"}
        justifyContent="flex-start"
        onClick={() => setActiveSection(section)}
      >
        {children}
      </Button>
    );
  };

  const fetchUserData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      if (!token || !userId) {
        throw new Error('No token or userId found');
      }

      const response = await axios.get('http://localhost:5000/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUser(response.data);
    } catch (error: any) {
      console.error('Error fetching user data:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fetch user data',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [toast]);

  const fetchElectionPhase = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/election/phase');
      setElectionPhase(response.data.phase);
    } catch (error) {
      console.error('Failed to fetch election phase:', error);
    }
  }, []);

  const fetchElectionResult = useCallback(async () => {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed');
      }

      if (!electionStatus?.id) return;

      const result = await getElectionResult(electionStatus.id);
      if (result) {
        setElectionResult({
          isResultDeclared: result.isResultDeclared,
          winnerId: result.winnerId,
          winnerName: result.winnerName,
          winnerVotes: result.winnerVotes
        });
      }
    } catch (error) {
      console.error('Failed to fetch election result:', error);
    }
  }, [electionStatus?.id]);

  const fetchContestants = useCallback(async () => {
    try {
      // Get contestants with current vote counts from the active election
      const response = await axios.get('http://localhost:5000/api/election/current');
      if (response.data && response.data.contestants) {
        setContestants(response.data.contestants.map((c: any) => ({
          id: c.id,
          name: c.name,
          age: c.age || 0,
          cnic: c.cnic || '',
          qualification: c.qualification || '',
          voteCount: c.voteCount || 0
        })));
      } else {
        // Fallback to general contestants endpoint if no active election
        const fetchedContestants = await getContestants();
        setContestants(fetchedContestants);
      }
    } catch (error) {
      console.error('Failed to fetch contestants:', error);
      // Fallback to general contestants endpoint on error
      try {
        const fetchedContestants = await getContestants();
        setContestants(fetchedContestants);
      } catch (fallbackError) {
        console.error('Fallback contestant fetch also failed:', fallbackError);
      }
    }
  }, []);

  const fetchElectionStatus = useCallback(async () => {
    try {
      // Get election from database first
      const response = await axios.get('http://localhost:5000/api/election/current');
      if (response.data) {
        setElectionStatus({
          id: response.data.id,
          name: response.data.name,
          status: response.data.status,
          startedAt: response.data.startedAt,
          scheduledEndTime: response.data.scheduledEndTime,
          durationMinutes: response.data.durationMinutes,
          isActive: response.data.isActive
        });
      } else {
        setElectionStatus(null);
      }
    } catch (error) {
      console.error('Failed to fetch election status:', error);
      setElectionStatus(null);
    }
  }, []);

  const initializeWeb3 = useCallback(async () => {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed');
      }

      const web3Instance = new Web3(window.ethereum);
      const contractInstance = await getContract(window.ethereum);

      if (!contractInstance) {
        throw new Error('Failed to load contract');
      }

      setContract(contractInstance);
    } catch (error: any) {
      console.error('Web3 initialization error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to initialize Web3',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [toast]);

  const fetchVoterStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await axios.get('http://localhost:5000/api/voter/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setVoterStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch voter status:', error);
    }
  }, []);

  const fetchApprovedVotersCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await axios.get('http://localhost:5000/api/voter/total-approved', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApprovedVotersCount(response.data.count);
    } catch (error) {
      console.error('Failed to fetch approved voters count:', error);
    }
  }, []);

  const fetchCompletedElections = useCallback(async () => {
    try {
      setIsLoadingCompleted(true);
      const response = await axios.get('http://localhost:5000/api/election/completed');
      setCompletedElections(response.data || []);
    } catch (error) {
      console.error('Failed to fetch completed elections:', error);
      setCompletedElections([]);
    } finally {
      setIsLoadingCompleted(false);
    }
  }, []);

  const fetchVotingDetails = useCallback(async (electionId?: number) => {
    try {
      setIsLoadingVotingDetails(true);
      const url = electionId 
        ? `http://localhost:5000/api/election/voting-details/${electionId}`
        : 'http://localhost:5000/api/election/voting-details';
      const response = await axios.get(url);
      setVotingDetails(response.data.votingDetails || []);
    } catch (error) {
      console.error('Failed to fetch voting details:', error);
      setVotingDetails([]);
    } finally {
      setIsLoadingVotingDetails(false);
    }
  }, []);

  const fetchElectionData = useCallback(async () => {
    if (electionDataLoaded) return; // Don't fetch if already loaded
    
    try {
      setElectionDataLoaded(true);
      await Promise.all([
        fetchElectionStatus(),
        fetchContestants(),
        fetchVotingDetails()
      ]);
    } catch (error) {
      console.error('Error fetching election data:', error);
      setElectionDataLoaded(false); // Reset on error so it can be retried
    }
  }, [electionDataLoaded, fetchElectionStatus, fetchContestants]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('userId');

        if (!token || !userId) {
          toast({
            title: 'Authentication Required',
            description: 'Please log in to access this page',
            status: 'error',
            duration: 3000,
            isClosable: true,
          });
          navigate('/user/login');
          return;
        }

        // Set up axios default headers
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        // Validate token
        const validateResponse = await axios.get('http://localhost:5000/api/user/validate-token');
        if (!validateResponse.data.valid) {
          throw new Error('Invalid token');
        }

        // Reset to information section on fresh login
        setActiveSection('information');

        // Fetch only essential user data (NO election data on login)
        await Promise.all([
          fetchUserData(),
          fetchVoterStatus(),
          fetchApprovedVotersCount(),
          fetchCompletedElections()
        ]);

        // Initialize Web3
        await initializeWeb3();

      } catch (error: any) {
        console.error('Error in fetchData:', error);
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('userId');
          navigate('/user/login');
        }
      }
    };

    fetchData();
  }, [
    fetchUserData,
    fetchVoterStatus,
    fetchApprovedVotersCount,
    fetchCompletedElections,
    initializeWeb3,
    navigate,
    toast
  ]);

  useEffect(() => {
    const handleNetworkChange = (event: CustomEvent) => {
      if (event.detail.error) {
        setNetworkError(event.detail.error);
        toast({
          title: 'Network Error',
          description: event.detail.error,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } else {
        setNetworkError(null);
        toast({
          title: 'Network Changed',
          description: `Connected to network ${event.detail.networkId}`,
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
        // Refresh only user data when network changes
        fetchUserData();
        fetchVoterStatus();
        // Reset election data loaded state so it refetches when needed
        setElectionDataLoaded(false);
      }
    };

    const handleAccountsChanged = (event: CustomEvent) => {
      if (event.detail.error) {
        toast({
          title: 'Wallet Error',
          description: event.detail.error,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Account Changed',
          description: `Connected to account ${event.detail.account}`,
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
        // Refresh data when account changes
        fetchUserData();
        fetchVoterStatus();
        // Reset election data loaded state so it refetches when needed
        setElectionDataLoaded(false);
      }
    };

    // Add event listeners
    window.addEventListener('networkChange', handleNetworkChange as EventListener);
    window.addEventListener('accountsChanged', handleAccountsChanged as EventListener);

    // Remove event listeners on cleanup
    return () => {
      window.removeEventListener('networkChange', handleNetworkChange as EventListener);
      window.removeEventListener('accountsChanged', handleAccountsChanged as EventListener);
    };
  }, [toast, fetchUserData, fetchVoterStatus]);

  // Effect to fetch election data when voting area or results section is accessed
  useEffect(() => {
    if (activeSection === 'voting-area' || activeSection === 'result') {
      fetchElectionData();
    }
  }, [activeSection, fetchElectionData]);

  // Effect to set up real-time updates only when election data is loaded and election is active
  useEffect(() => {
    let updateInterval: NodeJS.Timeout;

    if (electionDataLoaded && electionStatus?.isActive && (activeSection === 'voting-area' || activeSection === 'result')) {
      updateInterval = setInterval(() => {
        fetchContestants();
        fetchElectionStatus();
      }, 10000); // Update every 10 seconds
    }

    return () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  }, [electionDataLoaded, electionStatus?.isActive, activeSection, fetchContestants, fetchElectionStatus]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast({
        title: 'MetaMask Required',
        description: 'Please install MetaMask to continue',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsConnectingWallet(true);
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      setRegistrationData({ ...registrationData, walletAddress: accounts[0] });
      toast({
        title: 'Wallet Connected',
        description: 'Your MetaMask wallet has been connected successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      toast({
        title: 'Connection Failed',
        description: error.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleVoterRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registrationData.walletAddress) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your MetaMask wallet first',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!formData.dateOfBirth || !formData.phoneNumber || !formData.address || !formData.city) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsRegistering(true);
      const token = localStorage.getItem('token');
      
      const registrationPayload = {
        ...formData,
        walletAddress: registrationData.walletAddress,
        cnic: user.cnic,
        firstName: user.firstName,
        lastName: user.lastName,
      };

      await axios.post(
        'http://localhost:5000/api/voter/register',
        registrationPayload,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      // Update user data to get latest pendingVoter status
      await fetchUserData();
      
      // Update voter status
      await fetchVoterStatus();
      
      // Hide the form and show confirmation
      setShowRegistrationForm(false);

      toast({
        title: 'Registration Submitted',
        description: 'Your voter registration has been submitted for approval',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

    } catch (error: any) {
      toast({
        title: 'Registration Failed',
        description: error.response?.data?.error || 'Failed to submit registration',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleVote = async (contestantId: number) => {
    try {
      setIsVoting(true);
      await castVote(contestantId);
      
      toast({
        title: 'Vote Cast Successfully',
        description: 'Your vote has been recorded on the blockchain and database',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      
      // Immediately refresh data after successful vote
      await Promise.all([
        fetchElectionStatus(),
        fetchContestants(),
        fetchVoterStatus()
      ]);
      
      // Clear selected contestant
      setSelectedContestant('');
      
    } catch (error: any) {
      let errorMessage = 'Failed to cast vote';
      
      if (error.code === 'NO_PROVIDER') {
        errorMessage = 'Please install MetaMask to vote';
      } else if (error.code === 'NETWORK_ERROR') {
        errorMessage = 'Please connect to a supported network';
      } else if (error.code === 'NO_ACTIVE_ELECTION') {
        errorMessage = 'No active election found';
      } else if (error.code === 'INACTIVE_ELECTION') {
        errorMessage = 'The election is not currently active';
      } else if (error.code === 'NO_BLOCKCHAIN_ELECTION') {
        errorMessage = 'No active blockchain election found. Elections must be running on blockchain to vote.';
      } else if (error.code === 'INACTIVE_BLOCKCHAIN_ELECTION') {
        errorMessage = 'Blockchain election is not active. Cannot cast vote at this time.';
      } else if (error.code === 'USER_REJECTED') {
        errorMessage = 'Transaction was rejected. Vote not cast.';
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for blockchain transaction';
      } else if (error.code === 'TRANSACTION_ERROR') {
        errorMessage = `Blockchain transaction failed: ${error.message}`;
      } else if (error.code === 'SERVER_ERROR') {
        if (error.message.includes('already voted')) {
          errorMessage = 'You have already voted in this election';
        } else {
          errorMessage = `Server error: ${error.message}`;
        }
      } else if (error.message && error.message.includes('already voted')) {
        errorMessage = 'You have already cast your vote in this election. Each voter can only vote once.';
      } else if (error.message && error.message.includes('revert')) {
        // Handle smart contract revert errors more gracefully
        if (error.message.includes('Voter has already voted')) {
          errorMessage = 'You have already voted in this election. Thank you for participating!';
        } else if (error.message.includes('Voter not registered')) {
          errorMessage = 'Your voter registration is not approved yet. Please wait for admin approval.';
        } else if (error.message.includes('Election not active')) {
          errorMessage = 'The election is not currently accepting votes.';
        } else {
          errorMessage = 'Your vote could not be processed. Please try again or contact support.';
        }
      } else {
        errorMessage = error.message || 'Failed to cast vote';
      }

      toast({
        title: 'Unable to Cast Vote',
        description: errorMessage,
        status: 'error',
        duration: 8000,
        isClosable: true,
      });
    } finally {
      setIsVoting(false);
    }
  };

  const renderVoterRegistration = () => {
    // Only show registration form if user is not registered and not pending
    if (user?.pendingVoter) {
      return (
        <Alert
          status={user.pendingVoter.isApproved ? "success" : "info"}
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          height="200px"
          borderRadius="lg"
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertTitle mt={4} mb={1} fontSize="lg">
            {user.pendingVoter.isApproved
              ? "Registration Approved!"
              : "Registration Pending"}
          </AlertTitle>
          <AlertDescription maxWidth="sm">
            {user.pendingVoter.isApproved
              ? "Your voter registration has been approved. You can now participate in the voting process when it begins."
              : "Your registration is currently under review. Please check back later."}
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Box>
        <Heading size="md" mb={6}>Voter Registration</Heading>
        <form onSubmit={handleVoterRegistration}>
          <VStack spacing={4}>
            <FormControl>
              <FormLabel>Full Name</FormLabel>
              <Input
                value={`${user?.firstName || ''} ${user?.lastName || ''}`}
                isReadOnly
                bg={readOnlyBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Email</FormLabel>
              <Input
                value={user?.email || ''}
                isReadOnly
                bg={readOnlyBg}
              />
            </FormControl>

            <FormControl>
              <FormLabel>CNIC</FormLabel>
              <Input
                value={user?.cnic || ''}
                isReadOnly
                bg={readOnlyBg}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Date of Birth</FormLabel>
              <Input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) =>
                  setFormData({ ...formData, dateOfBirth: e.target.value })
                }
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Phone Number</FormLabel>
              <Input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) =>
                  setFormData({ ...formData, phoneNumber: e.target.value })
                }
                placeholder="Enter your phone number"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Address</FormLabel>
              <Input
                type="text"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Enter your address"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>City</FormLabel>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                placeholder="Enter your city"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Wallet Address</FormLabel>
              <InputGroup>
                <Input
                  value={registrationData.walletAddress}
                  isReadOnly
                  placeholder="Connect your wallet to get address"
                />
                <InputRightElement width="4.5rem">
                  <Button
                    h="1.75rem"
                    size="sm"
                    onClick={connectWallet}
                    isLoading={isConnectingWallet}
                  >
                    {registrationData.walletAddress ? 'Connected' : 'Connect'}
                  </Button>
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              mt={4}
              isLoading={isRegistering}
            >
              Submit Registration
            </Button>
          </VStack>
        </form>
      </Box>
    );
  };

  const renderVotingArea = () => {
    // Show loading state while election data is being fetched
    if (!electionDataLoaded) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="200px">
          <VStack spacing={4}>
            <Progress size="xs" isIndeterminate colorScheme="blue" width="200px" />
            <Text color="gray.500">Loading election data...</Text>
          </VStack>
        </Box>
      );
    }

    if (!electionStatus) {
      return (
        <Alert
          status="warning"
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          height="200px"
          borderRadius="lg"
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertTitle mt={4} mb={1} fontSize="lg">
            No Active Election
          </AlertTitle>
          <AlertDescription maxWidth="sm">
            There is no active election at the moment.
          </AlertDescription>
        </Alert>
      );
    }

    if (!electionStatus.isActive) {
      return (
        <Alert
          status="warning"
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          height="200px"
          borderRadius="lg"
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertTitle mt={4} mb={1} fontSize="lg">
            Voting Not Active
          </AlertTitle>
          <AlertDescription maxWidth="sm">
            The voting phase is not currently active. Please wait for the voting phase to begin.
          </AlertDescription>
        </Alert>
      );
    }

    if (!voterStatus?.isApproved) {
      return (
        <Alert
          status="error"
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          height="200px"
          borderRadius="lg"
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertTitle mt={4} mb={1} fontSize="lg">
            Not Registered
          </AlertTitle>
          <AlertDescription maxWidth="sm">
            You are not registered as a voter. Please register first to participate in voting.
          </AlertDescription>
        </Alert>
      );
    }

    if (voterStatus.hasVoted) {
      return (
        <Alert
          status="info"
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          height="200px"
          borderRadius="lg"
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertTitle mt={4} mb={1} fontSize="lg">
            Already Voted
          </AlertTitle>
          <AlertDescription maxWidth="sm">
            You have already cast your vote in this election.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Box>
        <VStack spacing={6} align="stretch">
          <Box>
            <Heading size="md" color="green.600">🗳️ Active Election - Cast Your Vote</Heading>
            <Text fontSize="sm" color="gray.600" mt={1}>
              Election is live! Select a candidate below and confirm with MetaMask.
            </Text>
          </Box>
          
          <Card borderColor="green.200" borderWidth="2px">
            <CardHeader bg="green.50">
              <Flex justify="space-between" align="center">
                <Heading size="sm" color="green.800">{electionStatus?.name || `Election #${electionStatus?.id}`}</Heading>
                <Badge colorScheme="green" fontSize="sm">🔴 LIVE</Badge>
              </Flex>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold" mb={2}>Time Remaining:</Text>
                  <Progress
                    value={(() => {
                      if (!electionStatus?.startedAt || !electionStatus?.scheduledEndTime) return 0;
                      const now = Date.now();
                      const startTime = new Date(electionStatus.startedAt).getTime();
                      const endTime = new Date(electionStatus.scheduledEndTime).getTime();
                      const total = endTime - startTime;
                      if (total <= 0) return 100;
                      return Math.min(100, Math.max(0, ((now - startTime) / total) * 100));
                    })()}
                    size="sm"
                    colorScheme="blue"
                  />
                  <Text mt={1} fontSize="sm" color="gray.500">
                    Ends in: {electionStatus?.scheduledEndTime 
                      ? formatTimeRemaining(Math.max(0, Math.floor((new Date(electionStatus.scheduledEndTime).getTime() - Date.now()) / 1000)))
                      : 'Unknown'
                    }
                  </Text>
                </Box>

                <Divider />

                <Box>
                  <Text fontWeight="bold" mb={4}>Select a Contestant to Vote:</Text>
                  <RadioGroup onChange={setSelectedContestant} value={selectedContestant}>
                    <Stack>
                      {contestants.map((contestant) => (
                        <Radio key={contestant.id} value={contestant.id.toString()}>
                          <HStack spacing={4}>
                            <Text fontWeight="medium">{contestant.name}</Text>
                            <Text color="gray.500">({contestant.qualification})</Text>
                          </HStack>
                        </Radio>
                      ))}
                    </Stack>
                  </RadioGroup>
                </Box>

                <Button
                  colorScheme="blue"
                  size="lg"
                  width="full"
                  onClick={() => handleVote(parseInt(selectedContestant))}
                  isLoading={isVoting}
                  isDisabled={!selectedContestant}
                >
                  Cast Vote
                </Button>

                <Button
                  colorScheme="red"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    console.log('=== DEBUG ELECTION TIMING ===');
                    const result = await debugElectionTiming();
                    console.log('Debug result:', result);
                  }}
                >
                  Debug Election Timing
                </Button>

                {votingError && (
                  <Alert status="error">
                    <AlertIcon />
                    {votingError}
                  </Alert>
                )}
              </VStack>
            </CardBody>
          </Card>
        </VStack>
      </Box>
    );
  };

  const renderResults = () => {
    // Show loading state while election data is being fetched
    if (!electionDataLoaded) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="200px">
          <VStack spacing={4}>
            <Progress size="xs" isIndeterminate colorScheme="blue" width="200px" />
            <Text color="gray.500">Loading election data...</Text>
          </VStack>
        </Box>
      );
    }

    // If there's an active election, show its results
    if (electionStatus && electionStatus.isActive && contestants) {
      const voteStats = {
        total: contestants.reduce((sum, contestant) => sum + (contestant.voteCount || 0), 0),
        sorted: [...contestants].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0))
      };

      const leader = voteStats.sorted[0];
      const runnerUp = voteStats.sorted[1];
      const isClose = leader && runnerUp && (leader.voteCount - runnerUp.voteCount) <= 3;

      return (
        <Box>
          <VStack spacing={6} align="stretch">
            <Heading size="md">Live Election Results</Heading>
            
            <Card>
              <CardHeader>
                <Flex justify="space-between" align="center">
                  <Heading size="sm">{electionStatus?.name || `Election #${electionStatus?.id}`}</Heading>
                  <Badge colorScheme="green">Live Results</Badge>
                </Flex>
              </CardHeader>
              <CardBody>
                <VStack spacing={4} align="stretch">
                  {/* Total Votes */}
                  <Box mt={4}>
                    <Card variant="outline">
                      <CardBody>
                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                          <Stat>
                            <StatLabel>Total Votes Cast</StatLabel>
                            <StatNumber>
                              {isNaN(voteStats.total) ? 0 : voteStats.total}
                            </StatNumber>
                          </Stat>
                          <Stat>
                            <StatLabel>Voter Turnout</StatLabel>
                            <StatNumber>
                              {isNaN(voteStats.total) ? '0.0' : ((voteStats.total / Math.max(1, voterStatus?.totalVoters || 0)) * 100).toFixed(1)}%
                            </StatNumber>
                            <StatHelpText>
                              of {voterStatus?.totalVoters || 0} eligible voters
                            </StatHelpText>
                          </Stat>
                        </SimpleGrid>
                      </CardBody>
                    </Card>
                  </Box>

                  {/* Vote Counts */}
                  <Box>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      {voteStats.sorted.map(contestant => (
                        <Card key={contestant.id} variant="outline">
                          <CardBody>
                            <VStack align="stretch" spacing={2}>
                              <Flex justify="space-between" align="center">
                                <Text fontWeight="bold">{contestant.name}</Text>
                                <Badge colorScheme={contestant === leader ? "green" : "gray"}>
                                  {contestant.voteCount || 0} votes
                                </Badge>
                              </Flex>
                              <Progress
                                value={((contestant.voteCount || 0) / Math.max(1, voteStats.total)) * 100}
                                size="sm"
                                colorScheme={contestant === leader ? "green" : "gray"}
                              />
                              <Text fontSize="sm" color="gray.500">
                                {(((contestant.voteCount || 0) / Math.max(1, voteStats.total)) * 100).toFixed(1)}% of total votes
                              </Text>
                            </VStack>
                          </CardBody>
                        </Card>
                      ))}
                    </SimpleGrid>
                  </Box>

                  {/* Close Race Warning */}
                  {isClose && (
                    <Alert status="warning">
                      <AlertIcon />
                      <AlertDescription>
                        This is a close race! Only {leader.voteCount - runnerUp.voteCount} votes between the top candidates.
                      </AlertDescription>
                    </Alert>
                  )}
                </VStack>
              </CardBody>
            </Card>

            {/* Voting Details Section */}
            <Card>
              <CardHeader>
                <Heading size="sm">Voting Details</Heading>
                <Text fontSize="sm" color="gray.500">Individual votes cast in this election</Text>
              </CardHeader>
              <CardBody>
                {isLoadingVotingDetails ? (
                  <Box display="flex" justifyContent="center" alignItems="center" height="100px">
                    <VStack spacing={4}>
                      <Progress size="xs" isIndeterminate colorScheme="blue" width="200px" />
                      <Text color="gray.500">Loading voting details...</Text>
                    </VStack>
                  </Box>
                ) : votingDetails.length === 0 ? (
                  <Text color="gray.500" textAlign="center" py={4}>
                    No votes have been cast yet.
                  </Text>
                ) : (
                  <VStack spacing={3} align="stretch" maxHeight="400px" overflowY="auto">
                    {votingDetails.map((vote, index) => (
                      <Card key={index} size="sm" variant="outline">
                        <CardBody>
                          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                            <Box>
                              <Text fontSize="xs" fontWeight="bold" color="gray.500">VOTER CNIC</Text>
                              <Text fontSize="sm">{vote.voterCnic}</Text>
                            </Box>
                            <Box>
                              <Text fontSize="xs" fontWeight="bold" color="gray.500">WALLET ADDRESS</Text>
                              <Text fontSize="xs" fontFamily="mono">
                                {vote.walletAddress.slice(0, 6)}...{vote.walletAddress.slice(-4)}
                              </Text>
                            </Box>
                            <Box>
                              <Text fontSize="xs" fontWeight="bold" color="gray.500">VOTED FOR</Text>
                              <Text fontSize="sm" fontWeight="medium" color="blue.600">
                                {vote.contestantName}
                              </Text>
                            </Box>
                          </SimpleGrid>
                        </CardBody>
                      </Card>
                    ))}
                  </VStack>
                )}
              </CardBody>
            </Card>
          </VStack>
        </Box>
      );
    }

    // If no active election, show completed elections if available
    if (completedElections.length > 0) {

      return (
        <Box>
          <VStack spacing={8} align="stretch">
            <Box>
              <Heading size="lg" color={resultTextColor} mb={2}>🏆 Election Results Dashboard</Heading>
              <Text color={resultMutedTextColor} fontSize="md">
                View detailed results and analytics for completed elections
              </Text>
            </Box>
            
            {isLoadingCompleted && (
              <Box display="flex" justifyContent="center" alignItems="center" height="200px">
                <VStack spacing={4}>
                  <Progress size="lg" isIndeterminate colorScheme="blue" width="300px" />
                  <Text color={resultMutedTextColor} fontSize="lg">Loading election results...</Text>
                </VStack>
              </Box>
            )}

            {completedElections.map(election => (
              <Card key={election.id} shadow="xl" borderRadius="xl" overflow="hidden" borderWidth={1}>
                <CardHeader bg={resultHeaderBg} py={6}>
                  <VStack align="start" spacing={3}>
                    <Flex justify="space-between" align="center" w="100%">
                      <Heading size="lg" color="blue.600">
                        🗳️ {election.name || `Election #${election.id}`}
                      </Heading>
                      <HStack spacing={3}>
                        <Badge colorScheme="green" fontSize="md" px={3} py={1}>✅ COMPLETED</Badge>
                        <Badge colorScheme="blue" fontSize="md" px={3} py={1}>{election.turnoutPercentage}% TURNOUT</Badge>
                      </HStack>
                    </Flex>
                    <Text fontSize="md" color={resultMutedTextColor} fontWeight="medium">
                      📅 Completed: {new Date(election.endedAt).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric'
                      })} at {new Date(election.endedAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                  </VStack>
                </CardHeader>
                
                <CardBody p={8}>
                  <VStack spacing={8} align="stretch">
                    {/* Winner Announcement */}
                    {election.winner.status === 'decided' && election.winner.contestant ? (
                      <Box>
                        <Alert 
                          status="success" 
                          borderRadius="xl" 
                                                     bg={resultWinnerAlertBg} 
                           borderColor={resultWinnerBorderColor}
                          borderWidth={2}
                          p={6}
                        >
                          <VStack spacing={4} align="center" w="100%">
                            <Text fontSize="4xl">🏆</Text>
                                                         <AlertTitle fontSize="2xl" color={resultTextColor} textAlign="center">
                              Winner: {election.winner.contestant.name}
                            </AlertTitle>
                            <AlertDescription>
                              <VStack spacing={2}>
                                <HStack spacing={6} justify="center">
                                                                     <Text fontWeight="bold" fontSize="xl" color={resultTextColor}>
                                    {election.winner.contestant.voteCount} votes
                                  </Text>
                                  <Text fontSize="xl" color="green.600" fontWeight="bold">
                                    ({election.winner.contestant.percentage}%)
                                  </Text>
                                </HStack>
                                                                 <Text fontSize="md" color={resultMutedTextColor}>
                                  Victory with {election.turnoutPercentage}% voter turnout ({election.totalVotes} of {election.totalVoters} eligible voters)
                                </Text>
                              </VStack>
                            </AlertDescription>
                          </VStack>
                        </Alert>
                      </Box>
                    ) : (
                      <Alert status="warning" borderRadius="xl" p={6}>
                        <VStack spacing={3} align="center" w="100%">
                          <Text fontSize="2xl">🤝</Text>
                                                     <AlertTitle fontSize="xl" color={resultTextColor}>Election Result: Draw</AlertTitle>
                           <AlertDescription color={resultMutedTextColor} textAlign="center">
                            This election ended in a tie. Multiple candidates received the same number of votes.
                          </AlertDescription>
                        </VStack>
                      </Alert>
                    )}

                    {/* Overall Statistics */}
                    <Box>
                                             <Heading size="md" mb={4} color={resultTextColor}>📊 Overall Statistics</Heading>
                      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={6}>
                                                 <Card bg={colorMode === 'light' ? 'blue.50' : 'blue.900'} borderRadius="xl" p={4}>
                           <VStack spacing={2}>
                             <Text fontSize="3xl" color="blue.600">📊</Text>
                             <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                               {election.totalVotes}
                             </Text>
                             <Text fontSize="sm" color={resultMutedTextColor} textAlign="center">
                               Total Votes
                             </Text>
                           </VStack>
                         </Card>

                         <Card bg={colorMode === 'light' ? 'green.50' : 'green.900'} borderRadius="xl" p={4}>
                           <VStack spacing={2}>
                             <Text fontSize="3xl" color="green.600">📈</Text>
                             <Text fontSize="2xl" fontWeight="bold" color="green.600">
                               {election.turnoutPercentage}%
                             </Text>
                             <Text fontSize="sm" color={resultMutedTextColor} textAlign="center">
                               Turnout Rate
                             </Text>
                           </VStack>
                         </Card>

                         <Card bg={colorMode === 'light' ? 'purple.50' : 'purple.900'} borderRadius="xl" p={4}>
                           <VStack spacing={2}>
                             <Text fontSize="3xl" color="purple.600">👥</Text>
                             <Text fontSize="2xl" fontWeight="bold" color="purple.600">
                               {election.totalVoters}
                             </Text>
                             <Text fontSize="sm" color={resultMutedTextColor} textAlign="center">
                               Eligible Voters
                             </Text>
                           </VStack>
                         </Card>

                         <Card bg={colorMode === 'light' ? 'orange.50' : 'orange.900'} borderRadius="xl" p={4}>
                           <VStack spacing={2}>
                             <Text fontSize="3xl" color="orange.600">🎯</Text>
                             <Text fontSize="2xl" fontWeight="bold" color="orange.600">
                               {election.contestants.length}
                             </Text>
                             <Text fontSize="sm" color={resultMutedTextColor} textAlign="center">
                               Candidates
                             </Text>
                           </VStack>
                         </Card>
                      </SimpleGrid>
                    </Box>

                    {/* Candidate Performance */}
                    <Box>
                                             <Heading size="md" mb={6} color={resultTextColor}>📈 Candidate Performance</Heading>
                      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                        {election.contestants.map((contestant, index) => (
                          <Card key={contestant.id} borderRadius="xl" p={6} position="relative" overflow="hidden">
                            <VStack align="stretch" spacing={4}>
                              <HStack justify="space-between" align="center">
                                <HStack spacing={3}>
                                  <Text fontSize="2xl">
                                    {index === 0 && election.winner.status === 'decided' ? '🥇' : 
                                     index === 1 ? '🥈' : 
                                     index === 2 ? '🥉' : '🏅'}
                                  </Text>
                                                                     <Text fontWeight="bold" fontSize="lg" color={resultTextColor}>
                                    {contestant.name}
                                  </Text>
                                </HStack>
                                <Badge 
                                  colorScheme={index === 0 ? "green" : index === 1 ? "blue" : "gray"} 
                                  fontSize="md" px={3} py={1}
                                >
                                  {contestant.voteCount} VOTES
                                </Badge>
                              </HStack>
                              
                              <Box>
                                                                 <Flex justify="space-between" mb={2}>
                                   <Text fontSize="sm" color={resultMutedTextColor}>Vote Share</Text>
                                   <Text fontSize="sm" fontWeight="bold" color={resultTextColor}>
                                    {contestant.percentage}%
                                  </Text>
                                </Flex>
                                <Progress
                                  value={parseFloat(contestant.percentage)}
                                  size="lg"
                                  colorScheme={index === 0 ? "green" : index === 1 ? "blue" : "gray"}
                                  borderRadius="full"
                                />
                              </Box>

                              {index === 0 && election.winner.status === 'decided' && (
                                <Box bg="green.50" p={3} borderRadius="lg">
                                  <HStack spacing={2}>
                                    <Text fontSize="lg">🎉</Text>
                                    <Text fontSize="sm" color="green.800" fontWeight="medium">
                                      Winner with {parseFloat(contestant.percentage).toFixed(1)}% of total votes
                                    </Text>
                                  </HStack>
                                </Box>
                              )}
                            </VStack>
                          </Card>
                        ))}
                      </SimpleGrid>
                    </Box>

                    {/* Individual Voting Details */}
                    <Box>
                      <Flex justify="space-between" align="center" mb={4}>
                                                 <Heading size="md" color={resultTextColor}>🔍 Individual Voting Details</Heading>
                        <Button
                          size="md"
                          colorScheme="blue"
                          variant="outline"
                          leftIcon={<Text>🔄</Text>}
                          onClick={() => fetchVotingDetails(election.id)}
                          isLoading={isLoadingVotingDetails}
                          loadingText="Loading..."
                          borderRadius="lg"
                        >
                          Refresh Details
                        </Button>
                      </Flex>
                      
                      {votingDetails.length > 0 ? (
                        <Box>
                                                     <Text fontSize="sm" color={resultMutedTextColor} mb={4}>
                            📋 Showing {votingDetails.length} individual votes cast in this election
                          </Text>
                          <Box 
                            maxHeight="400px" 
                            overflowY="auto" 
                            borderWidth={1} 
                            borderRadius="xl" 
                            p={4}
                                                         bg={colorMode === 'light' ? 'gray.50' : 'gray.800'}
                          >
                            <VStack spacing={3} align="stretch">
                              {votingDetails.map((vote, index) => (
                                <Card key={index} size="sm" variant="outline" borderRadius="lg">
                                  <CardBody p={4}>
                                    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" color="blue.600" mb={1}>VOTER CNIC</Text>
                                        <Text fontSize="sm" fontFamily="mono" color={textColor}>
                                          {vote.voterCnic}
                                        </Text>
                                      </Box>
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" color="purple.600" mb={1}>WALLET ADDRESS</Text>
                                                                                 <Text fontSize="xs" fontFamily="mono" color={resultMutedTextColor}>
                                          {vote.walletAddress.slice(0, 10)}...{vote.walletAddress.slice(-8)}
                                        </Text>
                                      </Box>
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" color="green.600" mb={1}>VOTED FOR</Text>
                                        <HStack spacing={2}>
                                          <Text fontSize="lg">🗳️</Text>
                                          <Text fontSize="sm" fontWeight="medium" color="green.700">
                                            {vote.contestantName}
                                          </Text>
                                        </HStack>
                                      </Box>
                                    </SimpleGrid>
                                  </CardBody>
                                </Card>
                              ))}
                            </VStack>
                          </Box>
                        </Box>
                      ) : (
                        <Card borderRadius="xl" p={6}>
                          <VStack spacing={4}>
                            <Text fontSize="3xl">📋</Text>
                                                         <Text color={resultMutedTextColor} textAlign="center">
                              Click "Refresh Details" to view individual voting records for this election
                            </Text>
                          </VStack>
                        </Card>
                      )}
                    </Box>
                  </VStack>
                </CardBody>
              </Card>
            ))}
          </VStack>
        </Box>
      );
    }

    // If no elections at all
    return (
      <Alert
        status="info"
        variant="subtle"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        textAlign="center"
        height="200px"
        borderRadius="lg"
      >
        <AlertIcon boxSize="40px" mr={0} />
        <AlertTitle mt={4} mb={1} fontSize="lg">
          No Elections Available
        </AlertTitle>
        <AlertDescription maxWidth="sm">
          There are no active or completed elections to display at this time.
        </AlertDescription>
      </Alert>
    );
  };

  const renderInformation = () => {
    return (
      <Box>
        <VStack spacing={6} align="stretch">
          <Heading size="lg" mb={4}>User Manual</Heading>
          
          <VoterRegistrationStatus user={user} />
          
          <Card>
            <CardHeader>
              <Heading size="md">Welcome {user?.firstName ? `${user.firstName} ${user.lastName}` : ''} to Block Vote</Heading>
              <Text mt={2} color="gray.600" fontSize="md" fontStyle="italic">
                "Your vote is your voice in the blockchain - secure, transparent, and immutable. Together, we're building a future where every vote counts and trust is guaranteed."
              </Text>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <Text fontWeight="medium" fontSize="lg">Follow these steps to participate in secure blockchain voting:</Text>
                
                <Box>
                  <Heading size="sm" mb={2}>1. MetaMask Wallet Setup</Heading>
                  <Text>
                    Before registration, ensure you have MetaMask wallet installed in your browser. This wallet 
                    will be your secure key to participate in the voting process. If you haven't installed MetaMask yet:
                  </Text>
                  <UnorderedList mt={2} ml={4}>
                    <ListItem>Install MetaMask extension from your browser's store</ListItem>
                    <ListItem>Create or import your wallet account</ListItem>
                    <ListItem>Keep your wallet credentials safe and secure</ListItem>
                  </UnorderedList>
                </Box>

                <Box>
                  <Heading size="sm" mb={2}>2. Voter Registration Process</Heading>
                  <Text>
                    Complete your voter registration during the registration phase. You'll need:
                  </Text>
                  <UnorderedList mt={2} ml={4}>
                    <ListItem>Your CNIC number</ListItem>
                    <ListItem>Connected MetaMask wallet address</ListItem>
                    <ListItem>Personal information (date of birth, phone number, address)</ListItem>
                  </UnorderedList>
                  <Text mt={2} color="blue.600">
                    Note: Registration is only possible during the active registration phase. Your registration will need admin approval before you can vote.
                  </Text>
                </Box>

                <Box>
                  <Heading size="sm" mb={2}>3. Checking Registration Status</Heading>
                  <Text>
                    After submitting your registration:
                  </Text>
                  <UnorderedList mt={2} ml={4}>
                    <ListItem>Monitor your registration status in the dashboard</ListItem>
                    <ListItem>Wait for admin approval notification</ListItem>
                    <ListItem>Once approved, you'll be eligible to vote in the next voting phase</ListItem>
                  </UnorderedList>
                </Box>

                <Box>
                  <Heading size="sm" mb={2}>4. Voting Process</Heading>
                  <Text>
                    <Text as="span" fontWeight="bold" color="blue.600">PRIMARY VOTING INTERFACE:</Text> Use the "Voting Area" section above to cast your vote.
                  </Text>
                  <UnorderedList mt={2} ml={4}>
                    <ListItem>✅ Must be an approved voter (check your registration status above)</ListItem>
                    <ListItem>🔗 Connect your MetaMask wallet when prompted</ListItem>
                    <ListItem>🗳️ Navigate to the "Voting Area" section during active elections</ListItem>
                    <ListItem>👤 Select your preferred candidate from the list</ListItem>
                    <ListItem>⛓️ Confirm the blockchain transaction through MetaMask</ListItem>
                    <ListItem>✨ Your vote is recorded on both blockchain and database</ListItem>
                  </UnorderedList>
                  <Alert status="success" mt={3} size="sm" rounded="md">
                    <AlertIcon />
                    <Box>
                      <AlertTitle fontSize="sm">Secure Blockchain Voting!</AlertTitle>
                      <AlertDescription fontSize="xs">
                        Your vote is permanently recorded on the blockchain and cannot be changed once submitted. This ensures complete transparency and immutability.
                      </AlertDescription>
                    </Box>
                  </Alert>
                </Box>

                <Box>
                  <Heading size="sm" mb={2}>5. Viewing Results</Heading>
                  <Text>
                    After the voting phase ends:
                  </Text>
                  <UnorderedList mt={2} ml={4}>
                    <ListItem>Visit the Result section to view real-time election results</ListItem>
                    <ListItem>Results are directly fetched from the blockchain, ensuring transparency</ListItem>
                    <ListItem>You can verify the results through blockchain explorer</ListItem>
                  </UnorderedList>
                </Box>

                <Alert status="info" mt={2}>
                  <AlertIcon />
                  <Box>
                    <AlertTitle>Security Reminder</AlertTitle>
                    <AlertDescription>
                      Never share your MetaMask wallet credentials or private keys. Your vote's security depends on keeping your wallet secure.
                    </AlertDescription>
                  </Box>
                </Alert>
              </VStack>
            </CardBody>
          </Card>
        </VStack>
      </Box>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'information':
        return renderInformation();
      case 'voter-registration':
        return (
          <Box>
            <Heading size="lg" mb={6}>Voter Registration</Heading>
            {renderVoterRegistration()}
          </Box>
        );
      case 'voting-area':
        return (
          <Box>
            <Heading size="lg" mb={6}>Voting Area</Heading>
            {renderVotingArea()}
          </Box>
        );
      case 'result':
        return (
          <Box>
            <Heading size="lg" mb={6}>Election Results</Heading>
            {renderResults()}
          </Box>
        );
      default:
        return renderInformation();
    }
  };

  const ThemeToggle = () => {
    const { colorMode, toggleColorMode } = useColorMode();
    
    return (
      <Tooltip label={`Switch to ${colorMode === 'light' ? 'dark' : 'light'} mode`} placement="left">
        <IconButton
          aria-label="Toggle color mode"
          icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
          onClick={toggleColorMode}
          variant="solid"
          size="lg"
          isRound
          boxShadow="lg"
          transition="all 0.2s"
          position="fixed"
          top="20px"
          right="20px"
          zIndex={1001}
          bg={colorMode === 'light' ? 'purple.500' : 'yellow.400'}
          color={colorMode === 'light' ? 'white' : 'gray.800'}
          _hover={{
            bg: colorMode === 'light' ? 'purple.600' : 'yellow.500',
            transform: 'scale(1.1)',
            boxShadow: 'xl',
          }}
        />
      </Tooltip>
    );
  };

  const formatTimeRemaining = (seconds: number): string => {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  // Show network error banner if present
  const NetworkErrorBanner = () => networkError ? (
    <Box
      bg="red.600"
      color="white"
      p={4}
      textAlign="center"
      position="fixed"
      top={0}
      left={0}
      right={0}
      zIndex="banner"
    >
      {networkError}
    </Box>
  ) : null;

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')}>
      <NetworkErrorBanner />
      <ThemeToggle />
      <Flex>
        {/* Desktop Sidebar */}
        <Hide below="md">
          <Box
            w="250px"
            bg={useColorModeValue('white', 'gray.800')}
            borderRight="1px"
            borderRightColor={useColorModeValue('gray.200', 'gray.700')}
            position="fixed"
            h="100vh"
            py={8}
            px={4}
          >
            <VStack spacing={4} align="stretch">
              <Button
                leftIcon={<InfoIcon />}
                colorScheme={activeSection === 'information' ? 'cyan' : 'gray'}
                variant={activeSection === 'information' ? 'solid' : 'ghost'}
                justifyContent="flex-start"
                onClick={() => setActiveSection('information')}
                size="lg"
                w="full"
              >
                Information
              </Button>
              
              <Button
                leftIcon={<AddIcon />}
                colorScheme={activeSection === 'voter-registration' ? 'cyan' : 'gray'}
                variant={activeSection === 'voter-registration' ? 'solid' : 'ghost'}
                justifyContent="flex-start"
                onClick={() => setActiveSection('voter-registration')}
                size="lg"
                w="full"
              >
                Voter Registration
              </Button>

              <Button
                leftIcon={<CheckIcon />}
                colorScheme={activeSection === 'voting-area' ? 'cyan' : 'gray'}
                variant={activeSection === 'voting-area' ? 'solid' : 'ghost'}
                justifyContent="flex-start"
                onClick={() => setActiveSection('voting-area')}
                size="lg"
                w="full"
              >
                Voting Area
              </Button>

              <Button
                leftIcon={<TimeIcon />}
                colorScheme={activeSection === 'result' ? 'cyan' : 'gray'}
                variant={activeSection === 'result' ? 'solid' : 'ghost'}
                justifyContent="flex-start"
                onClick={() => setActiveSection('result')}
                size="lg"
                w="full"
              >
                Result
              </Button>

              <Button
                leftIcon={<CloseIcon />}
                colorScheme="red"
                variant="ghost"
                justifyContent="flex-start"
                onClick={handleLogout}
                size="lg"
                w="full"
              >
                LogOut
              </Button>
            </VStack>
          </Box>
        </Hide>

        {/* Mobile/Tablet Menu */}
        <Show below="md">
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bg={useColorModeValue('white', 'gray.800')}
            borderBottom="1px"
            borderBottomColor={useColorModeValue('gray.200', 'gray.700')}
            px={4}
            py={2}
            zIndex={1000}
          >
            <Flex justify="space-between" align="center">
              <Menu>
                <MenuButton
                  as={IconButton}
                  icon={<HamburgerIcon />}
                  variant="outline"
                  aria-label="Menu"
                />
                <MenuList>
                  <MenuItem
                    icon={<InfoIcon />}
                    onClick={() => setActiveSection('information')}
                    bg={activeSection === 'information' ? 'cyan.50' : undefined}
                  >
                    Information
                  </MenuItem>
                  <MenuItem
                    icon={<AddIcon />}
                    onClick={() => setActiveSection('voter-registration')}
                    bg={activeSection === 'voter-registration' ? 'cyan.50' : undefined}
                  >
                    Voter Registration
                  </MenuItem>
                  <MenuItem
                    icon={<CheckIcon />}
                    onClick={() => setActiveSection('voting-area')}
                    bg={activeSection === 'voting-area' ? 'cyan.50' : undefined}
                  >
                    Voting Area
                  </MenuItem>
                  <MenuItem
                    icon={<TimeIcon />}
                    onClick={() => setActiveSection('result')}
                    bg={activeSection === 'result' ? 'cyan.50' : undefined}
                  >
                    Result
                  </MenuItem>
                  <MenuItem
                    icon={<CloseIcon />}
                    onClick={handleLogout}
                    color="red.500"
                  >
                    LogOut
                  </MenuItem>
                </MenuList>
              </Menu>
            </Flex>
          </Box>
        </Show>

        {/* Main Content */}
        <Box
          flex={1}
          ml={{ base: 0, md: '250px' }}
          mt={{ base: '60px', md: 0 }}
          p={8}
        >
          {renderContent()}
        </Box>
      </Flex>
    </Box>
  );
};

export default UserDashboard; 