import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  useToast,
  useColorModeValue,
  FormControl,
  FormLabel,
  Input,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Card,
  CardHeader,
  CardBody,
  Text,
  VStack,
  useColorMode,
  Flex,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge,
  HStack,
  Switch,
  Tooltip as ChakraTooltip,
  SimpleGrid,
  Divider,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useBreakpointValue,
  IconButton,
  useDisclosure
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MoonIcon, SunIcon, CheckIcon, CloseIcon, HamburgerIcon } from '@chakra-ui/icons';
import {
  createElection,
  startElection,
  endElection,
  addContestant,
  clearContestants
} from '../utils/web3';

interface VoterData {
  id: number;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  cnic: string;
  walletAddress: string;
  isApproved: boolean;
}

interface Election {
  id: number;
  name?: string;
  status: 'CREATED' | 'ACTIVE' | 'ENDED';
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  scheduledEndTime?: string;
  durationMinutes?: number;
  contestants: Array<{
    id: number;
    name: string;
    voteCount: number;
  }>;
  totalVotes: number;
  totalVoters: number;
  winner: string | null;
}

interface ElectionResult {
  id: number;
  name?: string;
  startTime: string;
  endTime: string;
  endedAt: string;
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

interface Contestant {
  id: number;
  name: string;
  age: number;
  cnic: string;
  qualification: string;
}

const AdminDashboard: React.FC = () => {
  const [pendingVoters, setPendingVoters] = useState<VoterData[]>([]);
  const [approvedVoters, setApprovedVoters] = useState<VoterData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [electionDetails, setElectionDetails] = useState({
    name: ''
  });
  const [elections, setElections] = useState<Election[]>([]);
  const [isEndingElection, setIsEndingElection] = useState(false);
  const [approvedVotersCount, setApprovedVotersCount] = useState(0);
  const [electionResults, setElectionResults] = useState<ElectionResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ElectionResult | null>(null);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [contestantForm, setContestantForm] = useState({
    name: '',
    age: '',
    cnic: '',
    qualification: ''
  });
  const [selectedContestants, setSelectedContestants] = useState<number[]>([]);
  const [deletingContestant, setDeletingContestant] = useState<number | null>(null);
  const [startElectionModal, setStartElectionModal] = useState<{ isOpen: boolean; electionId: number | null }>({
    isOpen: false,
    electionId: null
  });
  const [selectedDuration, setSelectedDuration] = useState(30); // Default 30 minutes
  const [customDuration, setCustomDuration] = useState('');
  const [votingDetails, setVotingDetails] = useState<any[]>([]);
  const [isLoadingVotingDetails, setIsLoadingVotingDetails] = useState(false);
  const [selectedElectionForDetails, setSelectedElectionForDetails] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('voter-management');
  const { isOpen: isMobileMenuOpen, onOpen: onMobileMenuOpen, onClose: onMobileMenuClose } = useDisclosure();

  const navigate = useNavigate();
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();

  const navigationItems = [
    { id: 'voter-management', label: '👥 Voter Management', icon: '👥' },
    { id: 'add-contestant', label: '👤 Add Contestant', icon: '👤' },
    { id: 'create-election', label: '🗳️ Create Election', icon: '🗳️' },
    { id: 'manage-elections', label: '⚙️ Manage Elections', icon: '⚙️' },
    { id: 'election-results', label: '📊 Election Results', icon: '📊' }
  ];

  const isMobile = useBreakpointValue({ base: true, md: false });
  const isTablet = useBreakpointValue({ base: false, md: true, lg: false });
  const inputBg = useColorModeValue('white', 'gray.700');
  const inputColor = useColorModeValue('gray.800', 'white');
  const cardBg = useColorModeValue('white', 'gray.700');
  const headerBg = useColorModeValue('gray.100', 'gray.700');
  const overallStatsBg = useColorModeValue('blue.50', 'blue.900');
  const blueStatBg = useColorModeValue('blue.50', 'blue.900');
  const greenStatBg = useColorModeValue('green.50', 'green.900');
  const purpleStatBg = useColorModeValue('purple.50', 'purple.900');
  const orangeStatBg = useColorModeValue('orange.50', 'orange.900');
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedTextColor = useColorModeValue('gray.600', 'gray.300');
  const contestantCardBg = useColorModeValue('white', 'gray.600');
  const contestantTextColor = useColorModeValue('gray.800', 'white');
  const contestantBorderColor = useColorModeValue('gray.200', 'gray.600');
  const selectedContestantBg = useColorModeValue('blue.50', 'blue.800');
  const hoverSelectedBg = useColorModeValue('blue.100', 'blue.700');
  const hoverUnselectedBg = useColorModeValue('gray.50', 'gray.500');
  const winnerAlertBg = useColorModeValue('green.50', 'green.900');
  const winnerBorderColor = useColorModeValue('green.200', 'green.600');

  const fetchPendingVoters = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.get('http://localhost:5000/api/admin/pending-voters', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingVoters(response.data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fetch pending voters',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [toast]);

  const fetchApprovedVoters = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.get('http://localhost:5000/api/admin/approved-voters', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApprovedVoters(response.data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fetch approved voters',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [toast]);

  const fetchApprovedVotersCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        console.error('No admin token found');
        return;
      }

      console.log('Fetching approved voters count...');
      const response = await axios.get('http://localhost:5000/api/admin/approved-voters-count', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Approved voters count response:', response.data);
      setApprovedVotersCount(response.data.count);
    } catch (error: any) {
      console.error('Error fetching approved voters count:', error.response || error);
      toast({
        title: 'Error',
        description: 'Failed to fetch approved voters count',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [toast]);

  const fetchElections = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      console.log('Fetching elections...');
      const response = await axios.get('http://localhost:5000/api/admin/elections', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Fetched elections:', response.data);
      setElections(response.data);
    } catch (error: any) {
      console.error('Error fetching elections:', error.response?.data || error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fetch elections',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [toast]);

  const fetchElectionResults = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      console.log('Fetching election results...');
      const response = await axios.get('http://localhost:5000/api/admin/election-results', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Raw election results:', response.data);

      // Validate and transform the data
      const validatedResults = (response.data || []).map((result: any) => ({
        ...result,
        winner: result.winner || { status: 'draw', contestant: null },
        contestants: result.contestants || [],
        totalVotes: result.totalVotes || 0,
        totalVoters: result.totalVoters || 0,
        turnoutPercentage: result.turnoutPercentage || '0'
      }));

      console.log('Validated election results:', validatedResults);
      setElectionResults(validatedResults);
    } catch (error: any) {
      console.error('Error fetching election results:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fetch election results',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      // Set empty results on error
      setElectionResults([]);
    }
  }, [toast]);

  const fetchVotingDetails = useCallback(async (electionId: number) => {
    try {
      setIsLoadingVotingDetails(true);
      const token = localStorage.getItem('adminToken');
      const response = await axios.get(`http://localhost:5000/api/election/voting-details/${electionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVotingDetails(response.data.votingDetails || []);
      setSelectedElectionForDetails(electionId);
    } catch (error) {
      console.error('Failed to fetch voting details:', error);
      setVotingDetails([]);
    } finally {
      setIsLoadingVotingDetails(false);
    }
  }, []);

  const fetchContestants = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.get('http://localhost:5000/api/admin/contestants', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setContestants(response.data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fetch contestants',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [toast]);

  const handleRejectVoter = async (voterId: number) => {
    // Find the voter to show their name in confirmation
    const voter = pendingVoters.find(v => v.id === voterId) || approvedVoters.find(v => v.id === voterId);
    const voterName = voter ? `${voter.user.firstName} ${voter.user.lastName}` : 'this voter';
    const isApproved = approvedVoters.some(v => v.id === voterId);
    
    const confirmMessage = isApproved 
      ? `Are you sure you want to REMOVE APPROVAL for ${voterName}? This will:\n\n• Remove their voting privileges\n• Delete their voter registration\n• Send them a notification email\n• They can re-register if needed\n\nThis action cannot be undone.`
      : `Are you sure you want to REJECT the registration for ${voterName}? This will:\n\n• Deny their voter registration\n• Send them a notification email\n• They can re-register with updated information\n\nThis action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setActionInProgress(voterId);
    try {
      const token = localStorage.getItem('adminToken');
      await axios.post(
        `http://localhost:5000/api/admin/reject-voter/${voterId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'Voter rejected successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Wait for all updates to complete
      await Promise.all([
        fetchPendingVoters(),
        fetchApprovedVoters(),
        fetchApprovedVotersCount()
      ]);
    } catch (error: any) {
      console.error('Error rejecting voter:', error.response || error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to reject voter',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApproveVoter = async (voterId: number) => {
    setActionInProgress(voterId);
    try {
      const token = localStorage.getItem('adminToken');
      await axios.post(
        `http://localhost:5000/api/admin/approve-voter/${voterId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: 'Voter approved successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Wait for all updates to complete
      await Promise.all([
        fetchPendingVoters(),
        fetchApprovedVoters(),
        fetchApprovedVotersCount()
      ]);
    } catch (error: any) {
      console.error('Error approving voter:', error.response || error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to approve voter',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAddContestant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        throw new Error('Admin token not found');
      }
      
      const { name, age, cnic, qualification } = contestantForm;

      if (!name || !age || !cnic || !qualification) {
        throw new Error('All fields are required');
      }

      // Add contestant to blockchain AND database using web3 function
      await addContestant(name, parseInt(age), cnic, qualification, adminToken);

      // Reset form
      setContestantForm({
        name: '',
        age: '',
        cnic: '',
        qualification: ''
      });

      toast({
        title: 'Success',
        description: 'Contestant added successfully to blockchain and database',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Refresh contestants list
      fetchContestants();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add contestant',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteContestant = async (contestantId: number, contestantName: string) => {
    if (!window.confirm(`Are you sure you want to remove "${contestantName}" from the database and screen? (Note: Data will remain permanently on blockchain for transparency)`)) {
      return;
    }

    setDeletingContestant(contestantId);
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('Admin token not found');
      }
      
      // Delete contestant from database only
      await axios.delete(`http://localhost:5000/api/admin/contestants/${contestantId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast({
        title: 'Success',
        description: `${contestantName} removed from database and screen. Blockchain record remains permanent.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Refresh contestants list
      fetchContestants();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to delete contestant',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setDeletingContestant(null);
    }
  };

  const handleClearContestants = async () => {
    if (!window.confirm('Are you sure you want to clear all contestants from the database and screen? (Note: Data will remain permanently on blockchain for transparency)')) {
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('Admin token not found');
      }
      
      // Clear contestants from database only (blockchain data remains permanently)
      await clearContestants(token);

      toast({
        title: 'Success',
        description: 'All contestants cleared from database and screen. Blockchain records remain permanent.',
        status: 'success',
        duration: 4000,
        isClosable: true,
      });

      // Refresh contestants list
      fetchContestants();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to clear contestants',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateElection = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('Admin token not found');
      }

      // Validate election name
      if (!electionDetails.name.trim()) {
        throw new Error('Election name is required');
      }

      // Validate contestant selection
      if (selectedContestants.length !== 2) {
        throw new Error('Please select exactly 2 contestants for the election');
      }

      // Create election in database only - blockchain happens on start
      const result = await createElection(electionDetails.name.trim(), selectedContestants, token);

      // Reset form
      setElectionDetails({
        name: ''
      });
      setSelectedContestants([]);

      toast({
        title: 'Election Created',
        description: result.message,
        status: 'success',
        duration: 5000,
        isClosable: true
      });

      // Refresh elections list
      fetchElections();
    } catch (error: any) {
      console.error('Error creating election:', error);
      
      // Handle different types of errors
      let errorMessage = 'Failed to create election';
      
      if (error.message.includes('User denied transaction signature')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction';
      } else if (error.message.includes('Server error')) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartElection = async (electionId: number) => {
    setStartElectionModal({ isOpen: true, electionId });
  };

  const confirmStartElection = async () => {
    if (!startElectionModal.electionId) return;
    
    const duration = selectedDuration === -1 ? parseInt(customDuration) : selectedDuration;
    
    if (!duration || duration < 15 || duration > 1440) {
      toast({
        title: 'Invalid Duration',
        description: 'Duration must be between 15 minutes and 1440 minutes (24 hours)',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);
    setStartElectionModal({ isOpen: false, electionId: null });
    
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('Admin token not found');
      }
      const result = await startElection(startElectionModal.electionId, token, duration);

      toast({
        title: 'Success',
        description: `${result.message} (Duration: ${duration} minutes)${result.blockchainStarted ? ' (Blockchain & Database)' : ' (Database Only)'}`,
        status: result.blockchainStarted ? 'success' : 'warning',
        duration: 7000,
        isClosable: true,
      });

      fetchElections(); // Refresh the elections list
    } catch (error: any) {
      console.error('Error starting election:', error);
      
      let errorMessage = 'Failed to start election';
      if (error.message.includes('User denied transaction signature')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndElection = async (electionId: number) => {
    if (!window.confirm('Are you sure you want to end this election? This action cannot be undone.')) {
      return;
    }
    
    setIsEndingElection(true);
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('Admin token not found');
      }
      const result = await endElection(electionId, token);

      toast({
        title: 'Success',
        description: result.message + (result.blockchainEnded ? ' (Blockchain & Database)' : ' (Database Only)'),
        status: result.blockchainEnded ? 'success' : 'warning',
        duration: 7000,
        isClosable: true,
      });

      fetchElections(); // Refresh the elections list
    } catch (error: any) {
      console.error('Error ending election:', error);
      
      let errorMessage = 'Failed to end election';
      if (error.message.includes('User denied transaction signature')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsEndingElection(false);
    }
  };

  const getStatusColor = (status: Election['status']) => {
    switch (status) {
      case 'CREATED':
        return 'yellow';
      case 'ACTIVE':
        return 'green';
      case 'ENDED':
        return 'blue';
      default:
        return 'gray';
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin/login');
      return;
    }

    console.log('Initial data fetch starting...');
    Promise.all([
      fetchPendingVoters(),
      fetchApprovedVoters(),
      fetchApprovedVotersCount(),
      fetchElectionResults()
    ]).then(() => {
      console.log('Initial data fetch complete');
    }).catch((error) => {
      console.error('Error during initial data fetch:', error);
    });
  }, [fetchPendingVoters, fetchApprovedVoters, fetchApprovedVotersCount, fetchElectionResults, navigate]);

  useEffect(() => {
    fetchElections();
  }, [fetchElections]);

  const ThemeToggle = () => (
    <ChakraTooltip label={`Switch to ${colorMode === 'light' ? 'dark' : 'light'} mode`}>
      <HStack spacing={2} p={2}>
        <SunIcon color={colorMode === 'light' ? 'orange.500' : 'gray.500'} />
        <Switch
          size="md"
          isChecked={colorMode === 'dark'}
          onChange={toggleColorMode}
          colorScheme="cyan"
        />
        <MoonIcon color={colorMode === 'dark' ? 'blue.200' : 'gray.500'} />
      </HStack>
    </ChakraTooltip>
  );

  const ResponsiveNavigation = () => {
    const navBg = useColorModeValue('white', 'gray.800');
    const navBorderColor = useColorModeValue('gray.200', 'gray.600');
    const activeItemBg = useColorModeValue('blue.50', 'blue.900');
    const activeItemColor = useColorModeValue('blue.600', 'blue.300');
    const hoverBg = useColorModeValue('gray.50', 'gray.700');

    const NavItem = ({ item, isActive, onClick }: { item: typeof navigationItems[0], isActive: boolean, onClick: () => void }) => (
      <Button
        variant={isActive ? 'solid' : 'ghost'}
        colorScheme={isActive ? 'blue' : 'gray'}
        bg={isActive ? activeItemBg : 'transparent'}
        color={isActive ? activeItemColor : textColor}
        _hover={{ bg: isActive ? activeItemBg : hoverBg }}
        onClick={onClick}
        size={{ base: 'sm', md: 'md' }}
        px={{ base: 3, md: 4 }}
        py={{ base: 2, md: 3 }}
        fontWeight={isActive ? 'bold' : 'medium'}
        borderRadius="lg"
        leftIcon={<Text fontSize={{ base: 'sm', md: 'md' }}>{item.icon}</Text>}
        iconSpacing={{ base: 1, md: 2 }}
        w="full"
        justifyContent="flex-start"
      >
        <Text fontSize={{ base: 'sm', md: 'md' }} display={{ base: 'none', sm: 'block' }}>
          {item.label.split(' ').slice(1).join(' ')}
        </Text>
      </Button>
    );

    if (isMobile) {
      return (
        <Box bg={navBg} borderBottomWidth={1} borderColor={navBorderColor} px={4} py={3}>
          <Flex justify="space-between" align="center">
            <Menu isOpen={isMobileMenuOpen} onClose={onMobileMenuClose}>
              <MenuButton
                as={IconButton}
                icon={<HamburgerIcon />}
                variant="outline"
                colorScheme="blue"
                onClick={onMobileMenuOpen}
                size="md"
              />
              <MenuList>
                {navigationItems.map((item) => (
                  <MenuItem
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      onMobileMenuClose();
                    }}
                    bg={activeTab === item.id ? activeItemBg : 'transparent'}
                    color={activeTab === item.id ? activeItemColor : textColor}
                    fontWeight={activeTab === item.id ? 'bold' : 'normal'}
                    icon={<Text>{item.icon}</Text>}
                  >
                    {item.label}
                  </MenuItem>
                ))}
                <Divider my={2} />
                <MenuItem
                  onClick={handleLogout}
                  color="red.500"
                  icon={<Text>🚪</Text>}
                >
                  Logout
                </MenuItem>
              </MenuList>
            </Menu>
            
            <Text fontWeight="bold" fontSize="lg" color={textColor}>
              {navigationItems.find(item => item.id === activeTab)?.label || 'Admin Dashboard'}
            </Text>
            
            <ThemeToggle />
          </Flex>
        </Box>
      );
    }

    return (
      <Box bg={navBg} borderBottomWidth={1} borderColor={navBorderColor} px={6} py={4}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
          <HStack spacing={1} flex={1} overflowX="auto" minW={0}>
            {navigationItems.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </HStack>
          
          <HStack spacing={4} flexShrink={0}>
            <ThemeToggle />
            <Button
              colorScheme="red"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              leftIcon={<Text>🚪</Text>}
            >
              Logout
            </Button>
          </HStack>
        </Flex>
      </Box>
    );
  };

  const ElectionTimer = ({ startTime, endTime, isActive, status }: { startTime: string, endTime: string, isActive: boolean, status?: string }) => {
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [progress, setProgress] = useState<number>(0);

    useEffect(() => {
      const calculateTimeLeft = () => {
        // If election is manually ended, show "Election ended"
        if (status === 'ENDED') {
          setProgress(100);
          return 'Election ended';
        }

        const now = new Date().getTime();
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const total = end - start;
        
        let timeLeft: number;
        let progressValue: number;

        if (now < start) {
          // Election hasn't started
          timeLeft = start - now;
          progressValue = 0;
          return `Starts in: ${formatDuration(timeLeft)}`;
        } else if (now > end) {
          // Election has ended by time
          progressValue = 100;
          return 'Election ended';
        } else {
          // Election is ongoing
          timeLeft = end - now;
          progressValue = ((now - start) / total) * 100;
          return `Time left: ${formatDuration(timeLeft)}`;
        }

        setProgress(progressValue);
      };

      const formatDuration = (ms: number) => {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));

        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      };

      // Only start interval if election is not manually ended
      if (status === 'ENDED') {
        setTimeLeft('Election ended');
        setProgress(100);
        return;
      }

      const timer = setInterval(() => {
        setTimeLeft(calculateTimeLeft());
      }, 1000);

      return () => clearInterval(timer);
    }, [startTime, endTime, status]);

    return (
      <Box w="100%">
        <Text textAlign="center" mb={2}>{timeLeft}</Text>
        <Progress
          value={progress}
          size="sm"
          colorScheme={isActive ? "green" : "gray"}
          borderRadius="full"
        />
      </Box>
    );
  };

  const ContestantCard = ({ contestant, totalVotes, totalVoters }: { 
    contestant: any, 
    totalVotes: number,
    totalVoters: number 
  }) => {
    const cardBg = useColorModeValue('white', 'gray.700');
    const percentage = totalVoters > 0 ? (contestant.voteCount / totalVoters) * 100 : 0;
    const progressPercentage = totalVoters > 0 ? (totalVotes / totalVoters) * 100 : 0;

    return (
      <Card bg={cardBg}>
        <CardHeader>
          <Heading size="md">{contestant.name}</Heading>
        </CardHeader>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Stat>
              <StatLabel>Votes Received</StatLabel>
              <StatNumber>{contestant.voteCount}</StatNumber>
              <StatHelpText>
                {percentage.toFixed(1)}% of expected voters ({totalVotes} of {totalVoters} total votes cast)
              </StatHelpText>
            </Stat>
            <Progress
              value={percentage}
              size="lg"
              colorScheme="blue"
              borderRadius="full"
            />
            <Text fontSize="sm" color="gray.500">
              Overall Voting Progress: {progressPercentage.toFixed(1)}%
            </Text>
            <Progress
              value={progressPercentage}
              size="sm"
              colorScheme="green"
              borderRadius="full"
            />
          </VStack>
        </CardBody>
      </Card>
    );
  };

  const ElectionCard = ({ election, onEndElection, isEndingElection }: { 
    election: Election, 
    onEndElection: (id: number) => void,
    isEndingElection: boolean 
  }) => (
    <Card key={election.id} mb={4} boxShadow="md">
      <CardHeader>
        <Flex justify="space-between" align="center">
          <VStack align="start" spacing={1}>
            <Heading size="md">{election.name || `Election #${election.id}`}</Heading>
            <Badge colorScheme={getStatusColor(election.status)} size="sm">
              {election.status.toUpperCase()}
            </Badge>
          </VStack>
          <HStack spacing={2}>
            {election.status === 'CREATED' && (
              <Button
                colorScheme="green"
                size="sm"
                onClick={() => handleStartElection(election.id)}
                isLoading={isLoading}
                loadingText="Starting..."
              >
                Start Election
              </Button>
            )}
            {election.status === 'ACTIVE' && (
              <Button
                colorScheme="red"
                size="sm"
                onClick={() => onEndElection(election.id)}
                isLoading={isEndingElection}
                loadingText="Ending..."
              >
                End Election
              </Button>
            )}
          </HStack>
        </Flex>
      </CardHeader>
      <CardBody>
        <VStack spacing={6} align="stretch">
          {election.startedAt && election.scheduledEndTime && (
            <ElectionTimer
              startTime={election.startedAt}
              endTime={election.scheduledEndTime}
              isActive={election.status === 'ACTIVE'}
              status={election.status}
            />
          )}
          
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {election.contestants.map(contestant => (
              <ContestantCard
                key={contestant.id}
                contestant={contestant}
                totalVotes={election.totalVotes}
                totalVoters={election.totalVoters}
              />
            ))}
          </SimpleGrid>

          <Box>
            <Text fontWeight="bold" mb={2}>Election Details:</Text>
            {election.startedAt && (
              <Text>Start Time: {formatDateTime(election.startedAt)}</Text>
            )}
            {election.scheduledEndTime && (
              <Text>
                Scheduled End Time: {formatDateTime(election.scheduledEndTime)}
                {election.endedAt && (
                  <Badge ml={2} colorScheme="red">Ended Early</Badge>
                )}
              </Text>
            )}
            <Text>Total Votes Cast: {election.totalVotes} of {election.totalVoters} expected</Text>
            <Text>Voting Progress: {((election.totalVotes / election.totalVoters) * 100).toFixed(1)}%</Text>
          </Box>
        </VStack>
      </CardBody>
    </Card>
  );

  const ElectionResultCard: React.FC<{ result: ElectionResult }> = ({ result }) => {
    const cardBg = useColorModeValue('white', 'gray.700');
    
    return (
      <Card bg={cardBg} mb={6} cursor="pointer" onClick={() => setSelectedResult(result)} 
            _hover={{ transform: 'translateY(-2px)', boxShadow: 'lg' }} transition="all 0.2s">
        <CardHeader>
          <VStack align="start" spacing={2}>
            <Heading size="md">{result.name || `Election #${result.id}`}</Heading>
            <HStack spacing={4}>
              <Text fontSize="sm" color="gray.500">
                Completed: {formatDateTime(result.endedAt)}
              </Text>
              <Badge colorScheme="blue">
                {result.turnoutPercentage}% Turnout
              </Badge>
            </HStack>
          </VStack>
        </CardHeader>
        <CardBody pt={0}>
          <HStack spacing={4} justify="space-between">
            <VStack align="start" spacing={1}>
              <Text fontSize="sm" fontWeight="bold">Winner</Text>
              <Text fontSize="md">
                {result.winner?.status === 'draw' ? 'Draw' : 
                 result.winner?.contestant?.name || 'No winner'}
              </Text>
            </VStack>
            <VStack align="start" spacing={1}>
              <Text fontSize="sm" fontWeight="bold">Total Votes</Text>
              <Text fontSize="md">{result.totalVotes} / {result.totalVoters}</Text>
            </VStack>
          </HStack>
        </CardBody>
      </Card>
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'voter-management':
        return (
          <VStack spacing={8} align="stretch">
            <Box>
              <Heading size="lg" color={textColor} mb={2}>👥 Voter Management System</Heading>
              <Text color={mutedTextColor} fontSize="md">
                Manage voter registrations, approvals, and oversee the voting process.
              </Text>
            </Box>

            {/* Statistics Cards */}
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
              <Card bg={cardBg} shadow="lg" borderRadius="xl" p={6}>
                <VStack spacing={3}>
                  <Box bg="orange.100" p={3} borderRadius="full">
                    <Text fontSize="2xl">⏳</Text>
                  </Box>
                  <Text fontSize="2xl" fontWeight="bold" color="orange.600">
                    {pendingVoters.length}
                  </Text>
                  <Text fontSize="sm" color={mutedTextColor} textAlign="center">
                    Pending Approvals
                  </Text>
                </VStack>
              </Card>

              <Card bg={cardBg} shadow="lg" borderRadius="xl" p={6}>
                <VStack spacing={3}>
                  <Box bg="green.100" p={3} borderRadius="full">
                    <Text fontSize="2xl">✅</Text>
                  </Box>
                  <Text fontSize="2xl" fontWeight="bold" color="green.600">
                    {approvedVoters.length}
                  </Text>
                  <Text fontSize="sm" color={mutedTextColor} textAlign="center">
                    Approved Voters
                  </Text>
                </VStack>
              </Card>

              <Card bg={cardBg} shadow="lg" borderRadius="xl" p={6}>
                <VStack spacing={3}>
                  <Box bg="blue.100" p={3} borderRadius="full">
                    <Text fontSize="2xl">👥</Text>
                  </Box>
                  <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                    {pendingVoters.length + approvedVoters.length}
                  </Text>
                  <Text fontSize="sm" color={mutedTextColor} textAlign="center">
                    Total Registrations
                  </Text>
                </VStack>
              </Card>
            </SimpleGrid>

            {/* Pending Voter Approvals Section */}
            <Card bg={cardBg} shadow="lg" borderRadius="xl">
              <CardHeader>
                <Flex align="center" justify="space-between">
                  <HStack spacing={3}>
                    <Text fontSize="2xl">⏳</Text>
                    <Box>
                      <Heading size="md" color={textColor}>Pending Voter Approvals</Heading>
                      <Text fontSize="sm" color={mutedTextColor}>
                        {pendingVoters.length} registration{pendingVoters.length !== 1 ? 's' : ''} waiting for review
                      </Text>
                    </Box>
                  </HStack>
                  <Badge colorScheme="orange" size="lg" px={3} py={1}>
                    {pendingVoters.length} Pending
                  </Badge>
                </Flex>
              </CardHeader>
              <CardBody pt={0}>
                {pendingVoters.length === 0 ? (
                  <Alert status="info" borderRadius="lg">
                    <AlertIcon />
                    <Box>
                      <AlertTitle>No Pending Registrations</AlertTitle>
                      <AlertDescription>
                        All voter registrations have been processed. New registrations will appear here.
                      </AlertDescription>
                    </Box>
                  </Alert>
                ) : (
                  <VStack spacing={4} align="stretch">
                    {pendingVoters.map((voter) => (
                      <Card key={voter.id} variant="outline" borderRadius="lg" p={5}>
                        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
                          <HStack spacing={4} flex={1} minW="300px">
                            <Box bg="orange.100" p={3} borderRadius="full" flexShrink={0}>
                              <Text fontSize="lg">👤</Text>
                            </Box>
                            <VStack align="start" spacing={1} flex={1}>
                              <Text fontWeight="bold" fontSize="lg" color={textColor}>
                                {voter.user.firstName} {voter.user.lastName}
                              </Text>
                              <HStack spacing={4} wrap="wrap">
                                <Text fontSize="sm" color={mutedTextColor}>
                                  📧 {voter.user.email}
                                </Text>
                                <Text fontSize="sm" color={mutedTextColor}>
                                  🆔 {voter.cnic}
                                </Text>
                              </HStack>
                              <Text fontSize="sm" color={mutedTextColor} fontFamily="mono">
                                🔗 {voter.walletAddress.slice(0, 10)}...{voter.walletAddress.slice(-8)}
                              </Text>
                            </VStack>
                          </HStack>
                          <HStack spacing={3} flexShrink={0}>
                            <Button
                              colorScheme="green"
                              size="md"
                              leftIcon={<CheckIcon />}
                              onClick={() => handleApproveVoter(voter.id)}
                              isLoading={actionInProgress === voter.id}
                              loadingText="Approving..."
                              _hover={{ transform: 'translateY(-1px)', shadow: 'lg' }}
                            >
                              Approve
                            </Button>
                            <Button
                              colorScheme="red"
                              variant="outline"
                              size="md"
                              leftIcon={<CloseIcon />}
                              onClick={() => handleRejectVoter(voter.id)}
                              isLoading={actionInProgress === voter.id}
                              loadingText="Rejecting..."
                              _hover={{ transform: 'translateY(-1px)', shadow: 'lg' }}
                            >
                              Reject
                            </Button>
                          </HStack>
                        </Flex>
                      </Card>
                    ))}
                  </VStack>
                )}
              </CardBody>
            </Card>

            {/* Approved Voters Section */}
            <Card bg={cardBg} shadow="lg" borderRadius="xl">
              <CardHeader>
                <Flex align="center" justify="space-between">
                  <HStack spacing={3}>
                    <Text fontSize="2xl">✅</Text>
                    <Box>
                      <Heading size="md" color={textColor}>Approved Voters</Heading>
                      <Text fontSize="sm" color={mutedTextColor}>
                        {approvedVoters.length} voter{approvedVoters.length !== 1 ? 's' : ''} eligible to participate in elections
                      </Text>
                    </Box>
                  </HStack>
                  <Badge colorScheme="green" size="lg" px={3} py={1}>
                    {approvedVoters.length} Approved
                  </Badge>
                </Flex>
              </CardHeader>
              <CardBody pt={0}>
                {approvedVoters.length === 0 ? (
                  <Alert status="info" borderRadius="lg">
                    <AlertIcon />
                    <Box>
                      <AlertTitle>No Approved Voters</AlertTitle>
                      <AlertDescription>
                        Approved voters will appear here. Process pending registrations to get started.
                      </AlertDescription>
                    </Box>
                  </Alert>
                ) : (
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={5}>
                    {approvedVoters.map((voter) => (
                      <Card key={voter.id} variant="outline" borderRadius="lg" p={5} position="relative">
                        <VStack align="start" spacing={3}>
                          <HStack spacing={3} w="full">
                            <Box bg="green.100" p={2} borderRadius="full" flexShrink={0}>
                              <Text fontSize="md">👤</Text>
                            </Box>
                            <VStack align="start" spacing={1} flex={1}>
                              <Text fontWeight="bold" color={textColor} noOfLines={1}>
                                {voter.user.firstName} {voter.user.lastName}
                              </Text>
                              <Badge colorScheme="green" size="sm">
                                ✓ Approved
                              </Badge>
                            </VStack>
                          </HStack>
                          
                          <VStack align="start" spacing={2} w="full">
                            <Text fontSize="xs" color={mutedTextColor}>
                              📧 {voter.user.email}
                            </Text>
                            <Text fontSize="xs" color={mutedTextColor}>
                              🆔 {voter.cnic}
                            </Text>
                            <Text fontSize="xs" color={mutedTextColor} fontFamily="mono">
                              🔗 {voter.walletAddress.slice(0, 8)}...{voter.walletAddress.slice(-6)}
                            </Text>
                          </VStack>

                          <Divider />

                          <Flex justify="space-between" align="center" w="full">
                            <Text fontSize="xs" color="green.600" fontWeight="medium">
                              Eligible to Vote
                            </Text>
                            <Menu>
                              <MenuButton
                                as={Button}
                                size="xs"
                                variant="ghost"
                                colorScheme="red"
                                rightIcon={<CloseIcon />}
                                _hover={{ bg: 'red.50' }}
                              >
                                Actions
                              </MenuButton>
                              <MenuList>
                                <MenuItem
                                  icon={<CloseIcon />}
                                  color="red.600"
                                  onClick={() => handleRejectVoter(voter.id)}
                                  isDisabled={actionInProgress === voter.id}
                                >
                                  {actionInProgress === voter.id ? 'Removing...' : 'Remove Approval'}
                                </MenuItem>
                              </MenuList>
                            </Menu>
                          </Flex>
                        </VStack>
                      </Card>
                    ))}
                  </SimpleGrid>
                )}
              </CardBody>
            </Card>
          </VStack>
        );

      case 'add-contestant':
        return (
          <VStack spacing={6} align="stretch">
            <Heading size="lg" color={textColor}>👤 Add Contestant</Heading>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={8}>
              <Card p={6}>
                      <VStack spacing={4} align="stretch">
                  <Heading size="md" color={textColor}>Add New Contestant</Heading>
                  <form onSubmit={handleAddContestant}>
                    <VStack spacing={4}>
                        <FormControl isRequired>
                        <FormLabel color={textColor}>Full Name</FormLabel>
                          <Input
                            placeholder="Enter contestant's full name"
                            value={contestantForm.name}
                            onChange={(e) => setContestantForm(prev => ({ ...prev, name: e.target.value }))}
                            bg={inputBg}
                            color={inputColor}
                          />
                        </FormControl>
                        <FormControl isRequired>
                        <FormLabel color={textColor}>Age</FormLabel>
                          <Input
                            type="number"
                            placeholder="Enter age"
                            value={contestantForm.age}
                            onChange={(e) => setContestantForm(prev => ({ ...prev, age: e.target.value }))}
                            bg={inputBg}
                            color={inputColor}
                          />
                        </FormControl>
                        <FormControl isRequired>
                        <FormLabel color={textColor}>CNIC</FormLabel>
                          <Input
                            placeholder="Enter CNIC (e.g., 12345-1234567-1)"
                            value={contestantForm.cnic}
                            onChange={(e) => setContestantForm(prev => ({ ...prev, cnic: e.target.value }))}
                            bg={inputBg}
                            color={inputColor}
                          />
                        </FormControl>
                        <FormControl isRequired>
                        <FormLabel color={textColor}>Qualification</FormLabel>
                          <Input
                          placeholder="Enter qualification"
                            value={contestantForm.qualification}
                            onChange={(e) => setContestantForm(prev => ({ ...prev, qualification: e.target.value }))}
                            bg={inputBg}
                            color={inputColor}
                          />
                        </FormControl>
                        <Button
                          type="submit"
                        colorScheme="blue"
                        size="lg"
                          width="full"
                        isLoading={isLoading}
                        loadingText="Adding Contestant..."
                        >
                          Add Contestant
                        </Button>
                      </VStack>
                    </form>
                </VStack>
              </Card>

              <Card p={6}>
                <VStack spacing={4} align="stretch">
                  <Flex justify="space-between" align="center">
                    <Heading size="md" color={textColor}>Current Contestants</Heading>
                    <Badge colorScheme="blue" fontSize="sm">{contestants.length} total</Badge>
                      </Flex>
                      {contestants.length === 0 ? (
                        <Alert status="info">
                          <AlertIcon />
                      <AlertDescription>No contestants added yet. Add the first contestant above.</AlertDescription>
                        </Alert>
                      ) : (
                    <VStack spacing={3} align="stretch" maxH="400px" overflowY="auto">
                            {contestants.map((contestant) => (
                        <Card key={contestant.id} size="sm" variant="outline">
                          <CardBody>
                            <Flex justify="space-between" align="center">
                              <VStack align="start" spacing={1} flex={1}>
                                <Text fontWeight="bold" color={textColor}>{contestant.name}</Text>
                                <Text fontSize="xs" color={mutedTextColor}>
                                  Age: {contestant.age} | CNIC: {contestant.cnic}
                                </Text>
                                <Text fontSize="xs" color={mutedTextColor}>
                                  {contestant.qualification}
                                </Text>
                              </VStack>
                                  <Button
                                    colorScheme="red"
                                size="xs"
                                    onClick={() => handleDeleteContestant(contestant.id, contestant.name)}
                                    isLoading={deletingContestant === contestant.id}
                                  >
                                    Remove
                                  </Button>
                            </Flex>
                          </CardBody>
                        </Card>
                            ))}
                    </VStack>
                      )}
                  </VStack>
              </Card>
            </SimpleGrid>
          </VStack>
        );

      case 'create-election':
        return (
          <VStack spacing={6} align="stretch">
            <Heading size="lg" color={textColor}>🗳️ Create New Election</Heading>
            <Card p={6} maxW="800px" mx="auto" w="full">
                    <form onSubmit={handleCreateElection}>
                <VStack spacing={6} align="stretch">
                        <FormControl isRequired>
                    <FormLabel color={textColor} fontSize="lg">Election Name</FormLabel>
                          <Input
                      placeholder="Enter election name (e.g., 'Presidential Election 2024')"
                            value={electionDetails.name}
                            onChange={(e) => setElectionDetails(prev => ({ ...prev, name: e.target.value }))}
                            bg={inputBg}
                            color={inputColor}
                      size="lg"
                          />
                        </FormControl>
                        
                        <Box>
                    <Heading size="md" mb={4} color={textColor}>Select Contestants (Exactly 2 Required)</Heading>
                          {contestants.length === 0 ? (
                      <Alert status="warning" borderRadius="lg">
                              <AlertIcon />
                              <Box>
                                <AlertTitle>No Contestants Available</AlertTitle>
                                <AlertDescription>
                                  Please add contestants first using the "Add Contestant" tab before creating an election.
                                </AlertDescription>
                              </Box>
                            </Alert>
                          ) : (
                            <VStack spacing={3} align="stretch">
                              {contestants.map((contestant) => (
                                <Box
                                  key={contestant.id}
                                  p={4}
                                  border="1px"
                            borderColor={selectedContestants.includes(contestant.id) ? 'blue.500' : contestantBorderColor}
                                  borderRadius="md"
                            bg={selectedContestants.includes(contestant.id) ? selectedContestantBg : contestantCardBg}
                                  cursor="pointer"
                                  onClick={() => {
                                    if (selectedContestants.includes(contestant.id)) {
                                      setSelectedContestants(prev => prev.filter(id => id !== contestant.id));
                                    } else if (selectedContestants.length < 2) {
                                      setSelectedContestants(prev => [...prev, contestant.id]);
                                    }
                                  }}
                                  _hover={{
                                    borderColor: 'blue.300',
                              bg: selectedContestants.includes(contestant.id) ? hoverSelectedBg : hoverUnselectedBg
                                  }}
                                >
                                  <HStack justify="space-between">
                                    <VStack align="start" spacing={1}>
                                <Text fontWeight="bold" color={contestantTextColor}>{contestant.name}</Text>
                                <Text fontSize="sm" color={mutedTextColor}>
                                        Age: {contestant.age} | CNIC: {contestant.cnic}
                                      </Text>
                                <Text fontSize="sm" color={mutedTextColor}>
                                        Qualification: {contestant.qualification}
                                      </Text>
                                    </VStack>
                                    {selectedContestants.includes(contestant.id) && (
                                      <CheckIcon color="blue.500" />
                                    )}
                                  </HStack>
                                </Box>
                              ))}
                        <Text fontSize="sm" color={mutedTextColor} textAlign="center">
                                Selected: {selectedContestants.length}/2 contestants
                              </Text>
                            </VStack>
                          )}
                        </Box>

                  <Alert status="info" borderRadius="lg">
                          <AlertIcon />
                          <Box>
                      <AlertTitle fontSize="sm">Total Eligible Voters</AlertTitle>
                      <AlertDescription fontSize="sm">
                        There are currently {approvedVotersCount} approved voters who will be eligible to participate in this election.
                            </AlertDescription>
                          </Box>
                        </Alert>

                        <Button
                          type="submit"
                          colorScheme="blue"
                    size="lg"
                          width="full"
                    isLoading={isLoading}
                          isDisabled={approvedVotersCount === 0 || selectedContestants.length !== 2}
                    loadingText="Creating Election..."
                        >
                          Create Election
                        </Button>
                      </VStack>
                    </form>
            </Card>
                  </VStack>
        );

      case 'manage-elections':
        return (
                  <VStack spacing={6} align="stretch">
            <Heading size="lg" color={textColor}>⚙️ Manage Elections</Heading>
                    <Accordion allowMultiple>
                      <AccordionItem>
                        <h2>
                          <AccordionButton>
                            <Box flex="1" textAlign="left">
                      <Heading size="md" color={textColor}>Active & Pending Elections</Heading>
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                        </h2>
                        <AccordionPanel pb={4}>
                          {elections.filter(e => ['ACTIVE', 'CREATED'].includes(e.status)).length === 0 ? (
                            <Alert status="info">
                              <AlertIcon />
                              No active or pending elections
                            </Alert>
                          ) : (
                            <VStack spacing={4} align="stretch">
                              {elections
                                .filter(e => ['ACTIVE', 'CREATED'].includes(e.status))
                                .map(election => (
                                  <ElectionCard
                                    key={election.id}
                                    election={election}
                                    onEndElection={handleEndElection}
                                    isEndingElection={isEndingElection}
                                  />
                                ))}
                            </VStack>
                          )}
                        </AccordionPanel>
                      </AccordionItem>

                      <AccordionItem>
                        <h2>
                          <AccordionButton>
                            <Box flex="1" textAlign="left">
                      <Heading size="md" color={textColor}>Completed Elections</Heading>
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                        </h2>
                        <AccordionPanel pb={4}>
                          {elections.filter(e => e.status === 'ENDED').length === 0 ? (
                            <Alert status="info">
                              <AlertIcon />
                              No completed elections
                            </Alert>
                          ) : (
                            <VStack spacing={4} align="stretch">
                              {elections
                                .filter(e => e.status === 'ENDED')
                                .map(election => (
                                  <ElectionCard
                                    key={election.id}
                                    election={election}
                                    onEndElection={handleEndElection}
                                    isEndingElection={isEndingElection}
                                  />
                                ))}
                            </VStack>
                          )}
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
                  </VStack>
        );

      case 'election-results':
        return (
          <VStack spacing={6} align="stretch">
            <Flex justify="space-between" align="center">
              <Heading size="lg" color={textColor}>📊 Election Analytics Dashboard</Heading>
              <Badge colorScheme="purple" fontSize="sm" p={2}>
                Advanced Statistics
              </Badge>
            </Flex>

                    {electionResults.length === 0 ? (
              <Alert status="info" borderRadius="lg" p={6}>
                <AlertIcon boxSize="40px" mr={4} />
                <Box>
                  <AlertTitle fontSize="lg" mb={2}>No Election Data Available</AlertTitle>
                  <AlertDescription>
                    Complete some elections to view comprehensive analytics and voting details.
                  </AlertDescription>
                </Box>
              </Alert>
            ) : (
              <VStack spacing={8} align="stretch">
                {/* Overall Statistics */}
                <Card bg={overallStatsBg} borderWidth={2} borderColor="blue.200">
                  <CardHeader>
                    <Heading size="md" color="blue.600">🎯 Overall Election Statistics</Heading>
                  </CardHeader>
                  <CardBody>
                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={6}>
                      <Stat>
                        <StatLabel>Total Elections</StatLabel>
                        <StatNumber fontSize="2xl">{electionResults.length}</StatNumber>
                      </Stat>
                      <Stat>
                        <StatLabel>Total Votes Cast</StatLabel>
                        <StatNumber fontSize="2xl">
                          {electionResults.reduce((sum, result) => sum + result.totalVotes, 0)}
                        </StatNumber>
                      </Stat>
                      <Stat>
                        <StatLabel>Average Turnout</StatLabel>
                        <StatNumber fontSize="2xl">
                          {(electionResults.reduce((sum, result) => sum + parseFloat(result.turnoutPercentage), 0) / electionResults.length).toFixed(1)}%
                        </StatNumber>
                      </Stat>
                      <Stat>
                        <StatLabel>Eligible Voters</StatLabel>
                        <StatNumber fontSize="2xl">
                          {electionResults[0]?.totalVoters || 0}
                        </StatNumber>
                      </Stat>
                    </SimpleGrid>
                  </CardBody>
                </Card>

                {/* Individual Election Results */}
                {electionResults.map(result => (
                  <Card key={result.id} shadow="lg" borderWidth={1}>
                    <CardHeader bg={headerBg}>
                      <VStack align="start" spacing={3}>
                        <Flex justify="space-between" align="center" w="100%">
                          <Heading size="md" color="blue.600">
                            🗳️ {result.name || `Election #${result.id}`}
                          </Heading>
                          <HStack spacing={2}>
                            <Badge colorScheme="green" fontSize="sm">Completed</Badge>
                            <Badge colorScheme="blue" fontSize="sm">{result.turnoutPercentage}% Turnout</Badge>
                          </HStack>
                        </Flex>
                        <Text fontSize="sm" color={mutedTextColor}>
                          📅 Completed: {formatDateTime(result.endedAt)}
                        </Text>
                      </VStack>
                    </CardHeader>
                    
                    <CardBody>
                      <VStack spacing={6} align="stretch">
                        {/* Winner Section */}
                        {result.winner?.status === 'decided' && result.winner.contestant ? (
                          <Alert status="success" borderRadius="lg" bg={winnerAlertBg} borderColor={winnerBorderColor}>
                        <AlertIcon />
                            <Box>
                              <AlertTitle fontSize="lg" color={textColor}>🏆 Winner: {result.winner.contestant.name}</AlertTitle>
                              <AlertDescription>
                                <HStack spacing={4} mt={2}>
                                  <Text fontWeight="bold" color={textColor}>{result.winner.contestant.voteCount} votes</Text>
                                  <Text color={textColor}>({result.winner.contestant.percentage}%)</Text>
                                </HStack>
                              </AlertDescription>
                            </Box>
                      </Alert>
                    ) : (
                          <Alert status="warning" borderRadius="lg">
                            <AlertIcon />
                            <AlertDescription color={textColor}>🤝 This election ended in a draw.</AlertDescription>
                          </Alert>
                        )}

                        {/* Key Metrics */}
                        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                          <Stat bg={blueStatBg} p={4} borderRadius="lg">
                            <StatLabel>Total Votes</StatLabel>
                            <StatNumber color="blue.600">{result.totalVotes}</StatNumber>
                            <StatHelpText>of {result.totalVoters} eligible</StatHelpText>
                          </Stat>
                          <Stat bg={greenStatBg} p={4} borderRadius="lg">
                            <StatLabel>Voter Turnout</StatLabel>
                            <StatNumber color="green.600">{result.turnoutPercentage}%</StatNumber>
                          </Stat>
                          <Stat bg={purpleStatBg} p={4} borderRadius="lg">
                            <StatLabel>Leading Margin</StatLabel>
                            <StatNumber color="purple.600">
                              {result.contestants.length >= 2 ? 
                                Math.abs(result.contestants[0].voteCount - result.contestants[1].voteCount) : 
                                'N/A'
                              }
                            </StatNumber>
                            <StatHelpText>vote difference</StatHelpText>
                          </Stat>
                          <Stat bg={orangeStatBg} p={4} borderRadius="lg">
                            <StatLabel>Participation</StatLabel>
                            <StatNumber color="orange.600">
                              {((result.totalVotes / result.totalVoters) * 100).toFixed(1)}%
                            </StatNumber>
                          </Stat>
                        </SimpleGrid>

                        {/* Candidate Results */}
                        <Box>
                          <Heading size="sm" mb={4} color={textColor}>📊 Candidate Performance</Heading>
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            {result.contestants.map((contestant, index) => (
                              <Card key={contestant.id} variant="outline" borderColor={index === 0 ? "green.300" : "gray.200"}>
                                <CardBody>
                                  <VStack align="stretch" spacing={3}>
                                    <Flex justify="space-between" align="center">
                                      <Text fontWeight="bold" fontSize="lg" color={textColor}>
                                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'} {contestant.name}
                                      </Text>
                                      <Badge colorScheme={index === 0 ? "green" : "gray"} fontSize="md" p={2}>
                                        {contestant.voteCount} votes
                                      </Badge>
                                    </Flex>
                                    <Progress
                                      value={parseFloat(contestant.percentage)}
                                      size="lg"
                                      colorScheme={index === 0 ? "green" : "gray"}
                                      borderRadius="full"
                                    />
                                    <Text fontSize="sm" color={mutedTextColor} textAlign="center">
                                      {contestant.percentage}% of total votes
                                    </Text>
                  </VStack>
          </CardBody>
        </Card>
                            ))}
                          </SimpleGrid>
                        </Box>

                        {/* Voting Details Section */}
                        <Box>
                          <Flex justify="space-between" align="center" mb={4}>
                            <Heading size="sm" color={textColor}>👥 Individual Voting Details</Heading>
        <Button
                              size="sm"
                              colorScheme="blue"
                              variant="outline"
                              onClick={() => fetchVotingDetails(result.id)}
                              isLoading={isLoadingVotingDetails && selectedElectionForDetails === result.id}
                            >
                              {selectedElectionForDetails === result.id && votingDetails.length > 0 ? 'Refresh' : 'View Details'}
        </Button>
                          </Flex>

                          {selectedElectionForDetails === result.id && (
                            <Box>
                              {isLoadingVotingDetails ? (
                                <Box textAlign="center" py={6}>
                                  <Progress size="xs" isIndeterminate colorScheme="blue" width="200px" mx="auto" />
                                  <Text color="gray.500" mt={2}>Loading voting details...</Text>
                                </Box>
                              ) : votingDetails.length === 0 ? (
                                <Alert status="info" borderRadius="lg">
                                  <AlertIcon />
                                  <AlertDescription>No voting details available for this election.</AlertDescription>
                                </Alert>
                              ) : (
                                <Box>
                                  <Text fontSize="sm" color={mutedTextColor} mb={3}>
                                    📋 Showing {votingDetails.length} individual votes
                                  </Text>
                                  <Box maxHeight="300px" overflowY="auto" borderWidth={1} borderRadius="lg" p={3}>
                                    <VStack spacing={2} align="stretch">
                                      {votingDetails.map((vote, index) => (
                                        <Card key={index} size="sm" variant="outline">
                                          <CardBody p={3}>
                                            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                                              <Box>
                                                <Text fontSize="xs" fontWeight="bold" color="blue.600">VOTER CNIC</Text>
                                                <Text fontSize="sm" fontFamily="mono" color={textColor}>{vote.voterCnic}</Text>
                                              </Box>
                                              <Box>
                                                <Text fontSize="xs" fontWeight="bold" color="purple.600">WALLET ADDRESS</Text>
                                                <Text fontSize="xs" fontFamily="mono" color={mutedTextColor}>
                                                  {vote.walletAddress.slice(0, 8)}...{vote.walletAddress.slice(-6)}
                                                </Text>
                                              </Box>
                                              <Box>
                                                <Text fontSize="xs" fontWeight="bold" color="green.600">VOTED FOR</Text>
                                                <Text fontSize="sm" fontWeight="medium" color="green.700">
                                                  🗳️ {vote.contestantName}
                                                </Text>
                                              </Box>
                                            </SimpleGrid>
                                          </CardBody>
                                        </Card>
                                      ))}
                                    </VStack>
                                  </Box>
                                </Box>
                              )}
                            </Box>
                          )}
                        </Box>
                      </VStack>
                    </CardBody>
                  </Card>
                ))}
              </VStack>
            )}
          </VStack>
        );

      default:
        return null;
    }
  };

  const forceRefreshContestants = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('Admin token not found');
      }
      const response = await axios.get('http://localhost:5000/api/admin/contestants', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setContestants(response.data);
    } catch (error) {
      console.error('Error refreshing contestants:', error);
    }
  };

  useEffect(() => {
    fetchPendingVoters();
    fetchApprovedVoters();
    fetchApprovedVotersCount();
    fetchElections();
    fetchElectionResults();
    fetchContestants();
  }, [fetchPendingVoters, fetchApprovedVoters, fetchApprovedVotersCount, fetchElections, fetchElectionResults, fetchContestants]);

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')}>
      {/* Header */}
      <Box bg={useColorModeValue('white', 'gray.800')} borderBottomWidth={1} borderColor={useColorModeValue('gray.200', 'gray.600')} px={6} py={4}>
        <Flex justify="space-between" align="center">
          <Heading size="xl" color={textColor}>
            🏛️ Admin Dashboard
          </Heading>
          {!isMobile && <ThemeToggle />}
        </Flex>
      </Box>

      {/* Responsive Navigation */}
      <ResponsiveNavigation />

             {/* Main Content */}
       <Container maxW="container.xl" py={6}>
         {renderActiveTabContent()}
      </Container>

      {/* Start Election Modal */}
      <Modal isOpen={startElectionModal.isOpen} onClose={() => setStartElectionModal({ isOpen: false, electionId: null })}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Start Election - Set Duration</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Text>How long should this election run?</Text>
              
              <FormControl>
                <FormLabel>Select Duration</FormLabel>
                <Select
                  value={selectedDuration}
                  onChange={(e) => {
                    setSelectedDuration(parseInt(e.target.value));
                    if (parseInt(e.target.value) !== -1) {
                      setCustomDuration('');
                    }
                  }}
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                  <option value={360}>6 hours</option>
                  <option value={480}>8 hours</option>
                  <option value={720}>12 hours</option>
                  <option value={1440}>24 hours (1 day)</option>
                  <option value={-1}>Custom Duration</option>
                </Select>
              </FormControl>

              {selectedDuration === -1 && (
                <FormControl>
                  <FormLabel>Custom Duration (minutes)</FormLabel>
                  <NumberInput
                    min={15}
                    max={1440}
                    value={customDuration}
                    onChange={(value) => setCustomDuration(value)}
                  >
                    <NumberInputField placeholder="Enter minutes (15-1440)" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Text fontSize="sm" color="gray.500" mt={1}>
                    Minimum: 15 minutes, Maximum: 1440 minutes (24 hours)
                  </Text>
                </FormControl>
              )}

              <Alert status="info">
                <AlertIcon />
                <Box>
                  <AlertTitle>Duration Notice</AlertTitle>
                  <AlertDescription>
                    The election will automatically end after the selected duration. 
                    You can also manually end it before the time expires using the "End Election" button.
                  </AlertDescription>
                </Box>
              </Alert>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setStartElectionModal({ isOpen: false, electionId: null })}>
              Cancel
            </Button>
            <Button 
              colorScheme="blue" 
              onClick={confirmStartElection}
              isLoading={isLoading}
            >
              Start Election
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default AdminDashboard; 