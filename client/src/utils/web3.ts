import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import VotingSystem from '../contracts/build/contracts/VotingSystem.json';
import { Contract } from 'web3-eth-contract';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface NetworkType {
  [key: string]: {
    address: string;
  };
}

// Network IDs for supported networks
const SUPPORTED_NETWORKS = {
  LOCALHOST: '1337',
  SEPOLIA: '11155111',
  GOERLI: '5'
};

// Custom error types
export class Web3Error extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'Web3Error';
  }
}

export class NetworkError extends Web3Error {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
  }
}

export class TransactionError extends Web3Error {
  constructor(message: string) {
    super(message, 'TRANSACTION_ERROR');
  }
}

// Network state management
let currentNetworkId: string | null = null;

// Initialize web3 with network monitoring
export const getWeb3 = async (): Promise<Web3> => {
  if (!window.ethereum) {
    throw new Web3Error('No Ethereum browser extension detected. Please install MetaMask.', 'NO_PROVIDER');
  }

  const web3 = new Web3(window.ethereum);

  try {
    // Request account access
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    // Get network ID
    const networkId = await web3.eth.net.getId();
    currentNetworkId = networkId.toString();

    // Check if network is supported
    if (!Object.values(SUPPORTED_NETWORKS).includes(currentNetworkId)) {
      throw new NetworkError('Please connect to a supported network (Localhost, Sepolia, or Goerli)');
    }

    // Setup network change listener
    window.ethereum.on('networkChanged', async (newNetworkId: string) => {
      if (!Object.values(SUPPORTED_NETWORKS).includes(newNetworkId)) {
        // Emit custom event for UI handling
        window.dispatchEvent(new CustomEvent('networkChange', {
          detail: { error: 'Unsupported network' }
        }));
      } else {
        currentNetworkId = newNetworkId;
        // Emit custom event for UI handling
        window.dispatchEvent(new CustomEvent('networkChange', {
          detail: { networkId: newNetworkId }
        }));
      }
    });

    // Setup account change listener
    window.ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        // Emit custom event for UI handling
        window.dispatchEvent(new CustomEvent('accountsChanged', {
          detail: { error: 'Please connect your MetaMask wallet' }
        }));
      } else {
        // Emit custom event for UI handling
        window.dispatchEvent(new CustomEvent('accountsChanged', {
          detail: { account: accounts[0] }
        }));
      }
    });

    return web3;
  } catch (error: any) {
    if (error instanceof Web3Error) {
      throw error;
    }
    throw new Web3Error(error.message || 'Failed to initialize Web3', 'INITIALIZATION_ERROR');
  }
};

// Enhanced contract getter with retries
export const getContract = async (provider: any, retries = 3): Promise<Contract> => {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const web3 = new Web3(provider);
      const networkId = await web3.eth.net.getId();
      const deployedNetwork = (VotingSystem.networks as NetworkType)[networkId.toString()];

      if (!deployedNetwork) {
        throw new NetworkError('Contract not deployed on the current network');
      }

      return new web3.eth.Contract(
        VotingSystem.abi as AbiItem[],
        deployedNetwork.address
      );
    } catch (error: any) {
      lastError = error;
      if (error instanceof NetworkError) {
        throw error; // Don't retry network errors
      }
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        continue;
      }
    }
  }

  throw new Web3Error(lastError?.message || 'Failed to load contract after multiple attempts', 'CONTRACT_LOAD_ERROR');
};

export const getContestants = async (): Promise<any[]> => {
  try {
    // Use API endpoint instead of direct contract call for better reliability
    const response = await axios.get(`${API_URL}/api/contestants`);
    return response.data;
  } catch (error) {
    console.error('Error getting contestants:', error);
    
    // Fallback to contract call if API fails
    try {
      const provider = window.ethereum;
      const contract = await getContract(provider);
      
      // Try to get contestants by iterating through IDs
      const contestants = [];
      for (let i = 1; i <= 10; i++) { // Reasonable limit
        try {
          const contestant = await contract.methods.getContestantDetails(i).call();
          if (contestant.name && contestant.name !== '') {
            contestants.push({
              id: i,
              name: contestant.name,
              age: parseInt(contestant.age),
              cnic: contestant.cnic,
              qualification: contestant.qualification,
              voteCount: parseInt(contestant.voteCount || 0)
            });
          }
        } catch (contractError) {
          // Stop when we reach an invalid contestant ID
          break;
        }
      }
      
      return contestants;
    } catch (contractError) {
      console.error('Contract fallback also failed:', contractError);
      throw error;
    }
  }
};

// Enhanced transaction sender with gas estimation and error handling
export const sendTransaction = async (
  contract: Contract,
  method: string,
  params: any[],
  from: string,
  value = '0'
): Promise<any> => {
  try {
    // Estimate gas with buffer
    const gasEstimate = await contract.methods[method](...params).estimateGas({ from, value });
    const gasLimit = Math.ceil(gasEstimate * 1.2); // Add 20% buffer

    // Send transaction
    const result = await contract.methods[method](...params).send({
      from,
      gas: gasLimit,
      value
    });

    return result;
  } catch (error: any) {
    // Handle common transaction errors
    if (error.message.includes('User denied')) {
      throw new TransactionError('Transaction was rejected by user');
    }
    if (error.message.includes('insufficient funds')) {
      throw new TransactionError('Insufficient funds for transaction');
    }
    if (error.message.includes('nonce too low')) {
      throw new TransactionError('Transaction failed: nonce too low. Please try again');
    }
    if (error.message.includes('gas required exceeds allowance')) {
      throw new TransactionError('Transaction failed: gas limit too low');
    }

    throw new TransactionError(error.message || 'Transaction failed');
  }
};

export const castVote = async (contestantId: number): Promise<void> => {
  const provider = window.ethereum;
  if (!provider) {
    throw new Web3Error('MetaMask is not installed', 'NO_PROVIDER');
  }

  try {
    // Get current election from database to validate timing
    const electionResponse = await axios.get('http://localhost:5000/api/election/current');
    if (!electionResponse.data) {
      throw new Web3Error('No active election found', 'NO_ACTIVE_ELECTION');
    }

    const databaseElection = electionResponse.data;
    
    // Check if election is active based on status
    if (!databaseElection.isActive || databaseElection.status !== 'ACTIVE') {
      throw new Web3Error('Election is not currently active', 'INACTIVE_ELECTION');
    }

    // Get voter's CNIC from the server
    const response = await axios.get('http://localhost:5000/api/voter/me');
    const voterCnic = response.data.cnic;

    // STEP 1: MANDATORY blockchain transaction
    console.log('Initiating blockchain vote transaction...');
    const contract = await getContract(provider);
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    
    // MANDATORY blockchain election validation and voting
    const currentElectionId = await contract.methods.currentElectionId().call();
    if (!currentElectionId || currentElectionId === '0') {
      throw new Web3Error('No blockchain election found. Elections must be active on blockchain to vote.', 'NO_BLOCKCHAIN_ELECTION');
    }

    // Check if election is active on blockchain
    const electionStatus = await contract.methods.getElectionStatus(currentElectionId).call();
    console.log('Blockchain election status response:', electionStatus);
    
    if (!electionStatus) {
      throw new Web3Error('Cannot retrieve blockchain election status.', 'NO_BLOCKCHAIN_STATUS');
    }
    
    // Parse status from the new contract format
    // The new contract returns ElectionStatus enum: 0=CREATED, 1=ACTIVE, 2=ENDED
    const statusValue = parseInt(electionStatus.status?.toString() || electionStatus[0]?.toString() || '0');
    console.log('Blockchain election status value:', statusValue);
    
    if (statusValue !== 1) { // 1 = ACTIVE
      const statusNames = ['CREATED', 'ACTIVE', 'ENDED'];
      const currentStatus = statusNames[statusValue] || 'UNKNOWN';
      throw new Web3Error(`Blockchain election is not active. Current status: ${currentStatus}. Cannot cast vote at this time.`, 'INACTIVE_BLOCKCHAIN_ELECTION');
    }
    
    console.log('Blockchain election is ACTIVE, proceeding with vote');

    // Cast vote on blockchain FIRST (this MUST succeed)
    console.log('Casting vote on blockchain for election:', currentElectionId);
    await sendTransaction(contract, 'castVote', [voterCnic, contestantId], accounts[0]);
    console.log('Blockchain vote transaction successful!');

    // STEP 2: Only if blockchain succeeds, update database
    console.log('Updating database with vote...');
    await axios.post('http://localhost:5000/api/election/vote', {
      contestantId,
      voterCnic,
      walletAddress: accounts[0]
    });

    console.log('Vote successfully recorded on blockchain and database');
  } catch (error: any) {
    console.error('Vote casting failed:', error);
    
    if (error instanceof Web3Error) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      throw new Web3Error(error.response?.data?.error || 'Server error', 'SERVER_ERROR');
    }
    // Handle MetaMask specific errors
    if (error.code === 4001) {
      throw new Web3Error('Transaction was rejected by user', 'USER_REJECTED');
    }
    if (error.message?.includes('insufficient funds')) {
      throw new Web3Error('Insufficient funds for transaction', 'INSUFFICIENT_FUNDS');
    }
    throw new Web3Error(error.message || 'Failed to cast vote', 'VOTE_ERROR');
  }
};

export const getElectionStatus = async () => {
  try {
    const provider = window.ethereum;
    const contract = await getContract(provider);
    
    // Get current election ID
    const currentElectionId = await contract.methods.currentElectionId().call();
    console.log('Current Election ID from blockchain:', currentElectionId);
    
    if (!currentElectionId || currentElectionId === '0') {
      console.log('No active election found on blockchain');
      return null;
    }

    // Get election status from new contract method
    const electionStatus = await contract.methods.getElectionStatus(currentElectionId).call();
    console.log('Election status from blockchain:', electionStatus);
    
    if (!electionStatus) {
      console.log('Election status data is invalid');
      return null;
    }

    // Parse the election status (0=CREATED, 1=ACTIVE, 2=ENDED)
    const statusMapping = ['CREATED', 'ACTIVE', 'ENDED'];
    const status = statusMapping[parseInt(electionStatus.status.toString())];
    const isActive = status === 'ACTIVE';

    const createdTime = parseInt(electionStatus.createdTime.toString());
    const startedTime = parseInt(electionStatus.startedTime.toString());
    const endedTime = parseInt(electionStatus.endedTime.toString());

    console.log('Election status check:', { 
      status,
      isActive,
      createdTime: new Date(createdTime * 1000).toISOString(),
      startedTime: startedTime > 0 ? new Date(startedTime * 1000).toISOString() : 'Not started',
      endedTime: endedTime > 0 ? new Date(endedTime * 1000).toISOString() : 'Not ended'
    });

    // Try to get additional data from server (optional)
    let totalVoters = 0;
    try {
      const response = await axios.get('http://localhost:5000/api/voter/total-approved');
      totalVoters = response.data.count;
    } catch (serverError) {
      console.warn('Could not fetch voter count from server:', serverError);
      // Continue without server data
    }

    // Get total votes from contestants
    let totalVotes = 0;
    try {
      const contestants = await getContestants();
      totalVotes = contestants.reduce((sum, contestant) => sum + (contestant.voteCount || 0), 0);
    } catch (contestantError) {
      console.warn('Could not fetch contestants:', contestantError);
      // Continue without contestant data
    }

    const result = {
      id: parseInt(currentElectionId.toString()),
      status,
      isActive,
      createdTime,
      startedTime,
      endedTime,
      totalVoters,
      totalVotes
    };

    console.log('Final election status:', result);
    return result;
  } catch (error) {
    console.error('Error getting election status:', error);
    return null;
  }
};

export const declareWinner = async (electionId: number): Promise<void> => {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use this feature.');
  }

  const contract = await getContract(provider);
  const accounts = await provider.request({ method: 'eth_requestAccounts' });

  return contract.methods.declareWinner(electionId).send({
    from: accounts[0],
    gas: 3000000
  });
};

export const getElectionResult = async (electionId: number) => {
  const provider = window.ethereum;
  const contract = await getContract(provider);
  const result = await contract.methods.getElectionResult(electionId).call();
  
  return {
    isResultDeclared: result.isResultDeclared,
    winnerId: parseInt(result.winnerId, 10),
    winnerName: result.winnerName,
    winnerVotes: parseInt(result.winnerVotes, 10),
    isActive: result.isActive,
    startTime: parseInt(result.startTime, 10),
    endTime: parseInt(result.endTime, 10)
  };
};

export const submitVoterRegistration = async (cnic: string): Promise<void> => {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use this feature.');
  }

  const contract = await getContract(provider);
  const accounts = await provider.request({ method: 'eth_requestAccounts' });

  // Check if registration phase is active
  const isRegistrationActive = await contract.methods.isRegistrationPhaseActive().call();
  if (!isRegistrationActive) {
    throw new Error('Voter registration is not active at the moment');
  }

  // Check if voter is already registered
  const voterStatus = await contract.methods.getVoterStatus(cnic).call();
  if (voterStatus.isRegistered) {
    throw new Error('Voter is already registered');
  }

  // Submit registration to contract
  await contract.methods.registerVoter(cnic, accounts[0]).send({
    from: accounts[0],
    gas: 3000000
  });

  // Submit registration to server
  await axios.post('http://localhost:5000/api/voter/register', {
    cnic,
    walletAddress: accounts[0]
  });
};

export const getVoterStatus = async (cnic: string) => {
  try {
    const provider = window.ethereum;
    const contract = await getContract(provider);

    // Get voter status from contract
    const contractStatus = await contract.methods.getVoterStatus(cnic).call();

    // Get current election ID
    const currentElectionId = await contract.methods.currentElectionId.call();
    if (!currentElectionId || currentElectionId === '0') {
      return {
        isRegistered: contractStatus.isRegistered,
        isPending: contractStatus.isPending,
        isApproved: contractStatus.isApproved,
        registrationTime: parseInt(contractStatus.registrationTime),
        hasVoted: false,
        totalVoters: 0
      };
    }

    // Get election details
    const election = await contract.methods.elections(currentElectionId).call();
    if (!election || !election.id || election.id === '0') {
      return {
        isRegistered: contractStatus.isRegistered,
        isPending: contractStatus.isPending,
        isApproved: contractStatus.isApproved,
        registrationTime: parseInt(contractStatus.registrationTime),
        hasVoted: false,
        totalVoters: 0
      };
    }

    // Get voter details from contract
    const voter = await contract.methods.voters(cnic).call();

    // Get total approved voters from server
    const response = await axios.get('http://localhost:5000/api/voter/total-approved');

    return {
      isRegistered: contractStatus.isRegistered,
      isPending: contractStatus.isPending,
      isApproved: contractStatus.isApproved,
      registrationTime: parseInt(contractStatus.registrationTime),
      hasVoted: voter.hasVoted,
      totalVoters: response.data.count
    };
  } catch (error) {
    console.error('Error getting voter status:', error);
    throw error;
  }
};

export const createElection = async (
  name: string,
  contestantIds: number[],
  token: string
): Promise<{ message: string }> => {
  try {
    console.log('Creating election (database only):', { name, contestantIds });

    // Server handles database creation only - blockchain happens on start
    const response = await axios.post(
      `${API_URL}/api/admin/elections`,
      {
        name,
        contestantIds
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Election creation response:', response.data);
    
    return {
      message: response.data.message || 'Election created successfully! Click "Start Election" to begin voting.'
    };
  } catch (error: any) {
    console.error('Election creation failed:', error);
    
    // Check if it's an axios error
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.response.data?.message || 'Unknown server error';
      throw new Error(`Server error (${status}): ${message}`);
    }
    
    // Handle other errors
    throw new Error(`Failed to create election: ${error.message}`);
  }
};

// New function: Start election
export const startElection = async (electionId: number, token: string, durationMinutes: number): Promise<{ blockchainStarted: boolean; message: string }> => {
  try {
    console.log('Starting election:', electionId, 'Duration:', durationMinutes, 'minutes');

    // Server handles both blockchain and database updates
    const response = await axios.post(
      `${API_URL}/api/admin/elections/${electionId}/start`,
      {
        durationMinutes
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Election start response:', response.data);
    
    return {
      blockchainStarted: response.data.blockchainStarted || false,
      message: response.data.message || 'Election started successfully'
    };
  } catch (error: any) {
    console.error('Failed to start election:', error);
    throw new Error(`Failed to start election: ${error.message}`);
  }
};

// New function: End election
export const endElection = async (electionId: number, token: string): Promise<{ blockchainEnded: boolean; message: string }> => {
  try {
    console.log('Ending election:', electionId);

    // Server handles both blockchain and database updates
    const response = await axios.post(
      `${API_URL}/api/admin/elections/${electionId}/end`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Election end response:', response.data);
    
    return {
      blockchainEnded: response.data.blockchainEnded || false,
      message: response.data.message || 'Election ended successfully'
    };
  } catch (error: any) {
    console.error('Failed to end election:', error);
    throw new Error(`Failed to end election: ${error.message}`);
  }
};

export const addContestant = async (
  name: string,
  age: number,
  cnic: string,
  qualification: string,
  token: string
): Promise<void> => {
  try {
    const provider = window.ethereum;
    const contract = await getContract(provider);
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const from = accounts[0];

    // First add to blockchain
    console.log('Adding contestant to blockchain...');
    await contract.methods.addContestant(name, age, cnic, qualification).send({ from });
    console.log('Successfully added contestant to blockchain');

    // Then add to database
    await axios.post(
      'http://localhost:5000/api/admin/contestants',
      {
        name,
        age,
        cnic,
        qualification
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
  } catch (error: any) {
    console.error('Error adding contestant:', error);
    throw new Error(error.message || 'Failed to add contestant');
  }
};

export const clearContestants = async (token: string): Promise<void> => {
  try {
    // Clear from database only (blockchain data remains permanently)
    console.log('Clearing contestants from database only...');
    await axios.delete('http://localhost:5000/api/admin/contestants', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Successfully cleared contestants from database');
  } catch (error: any) {
    console.error('Error clearing contestants:', error);
    throw new Error(error.message || 'Failed to clear contestants');
  }
};

export const debugElectionTiming = async () => {
  try {
    console.log('=== ELECTION DEBUG INFO ===');
    
    // Get database election status
    let databaseElection = null;
    try {
      const response = await axios.get('http://localhost:5000/api/election/current');
      databaseElection = response.data;
      console.log('Database Election:', databaseElection);
    } catch (dbError) {
      console.log('No active election in database');
    }
    
    // Get blockchain election status
    let blockchainElection = null;
    try {
      const provider = window.ethereum;
      const contract = await getContract(provider);
      
      const currentElectionId = await contract.methods.currentElectionId().call();
      console.log('Blockchain Election ID:', currentElectionId);
      
      if (currentElectionId && currentElectionId !== '0') {
        blockchainElection = await contract.methods.elections(currentElectionId).call();
        console.log('Blockchain Election Data:', blockchainElection);
      }
    } catch (blockchainError: any) {
      console.log('Blockchain election error:', blockchainError.message);
    }
    
    // Compare both systems
    const now = new Date();
    console.log('Current time:', now.toISOString());
    
    if (databaseElection) {
      console.log('Database Election Status:', databaseElection.status);
      console.log('Database Started At:', databaseElection.startedAt);
      console.log('Database Scheduled End:', databaseElection.scheduledEndTime);
      console.log('Database Duration (minutes):', databaseElection.durationMinutes);
      console.log('Database Is Active:', databaseElection.isActive);
    }
    
    return {
      database: databaseElection,
      blockchain: blockchainElection,
      currentTime: now.toISOString(),
      timingSource: 'Database-driven timing system (blockchain used for vote recording only)'
    };
  } catch (error) {
    console.error('Error debugging election timing:', error);
    return null;
  }
}; 