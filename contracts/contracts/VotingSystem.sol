// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VotingSystem {
    struct Contestant {
        uint256 id;
        string name;
        uint256 age;
        string cnic;
        string qualification;
        uint256 voteCount;
        bool isRegistered;
    }

    struct Voter {
        string cnic;
        address walletAddress;
        bool isRegistered;
        bool hasVoted;  // Keep for backward compatibility, but don't use
        bool isApproved;
        uint256 registrationTime;
    }

    // Updated Election struct - removed timing, added status
    enum ElectionStatus { CREATED, ACTIVE, ENDED }
    
    struct Election {
        uint256 id;
        ElectionStatus status;
        bool isResultDeclared;
        uint256 winnerId;
        uint256 createdTime;
        uint256 startedTime;
        uint256 endedTime;
        mapping(uint256 => bool) contestants;
    }

    address public admin;
    uint256 public currentElectionId;
    uint256 public contestantCount;
    bool public isRegistrationPhaseActive;
    
    mapping(uint256 => Contestant) public contestants;
    mapping(string => Voter) public voters;
    mapping(uint256 => Election) public elections;
    mapping(address => bool) public registeredWallets;
    
    // NEW: Track votes per election to allow voting in multiple elections
    mapping(uint256 => mapping(string => bool)) public hasVotedInElection;

    // Array to keep track of pending voter registrations
    string[] public pendingVoters;
    mapping(string => bool) public isPendingVoter;

    event VoterRegistrationSubmitted(string cnic, address walletAddress);
    event VoterApproved(string cnic, address walletAddress);
    event ContestantAdded(uint256 id, string name);
    event ElectionCreated(uint256 id, uint256 createdTime);
    event ElectionStarted(uint256 id, uint256 startedTime);
    event ElectionEnded(uint256 id, uint256 endedTime);
    event VoteCast(string voterCnic, uint256 contestantId);
    event WinnerDeclared(uint256 electionId, uint256 winnerId, uint256 voteCount);
    event RegistrationPhaseChanged(bool isActive);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier registrationPhaseActive() {
        require(isRegistrationPhaseActive, "Registration phase is not active");
        _;
    }

    modifier electionActive(uint256 _electionId) {
        require(elections[_electionId].status == ElectionStatus.ACTIVE, "Election is not active");
        _;
    }

    constructor() {
        admin = msg.sender;
        currentElectionId = 0;
        contestantCount = 0;
    }

    function startRegistrationPhase() public onlyAdmin {
        isRegistrationPhaseActive = true;
        emit RegistrationPhaseChanged(true);
    }

    function stopRegistrationPhase() public onlyAdmin {
        isRegistrationPhaseActive = false;
        emit RegistrationPhaseChanged(false);
    }

    function submitVoterRegistration(string memory _cnic) public registrationPhaseActive {
        require(bytes(_cnic).length > 0, "CNIC cannot be empty");
        require(!voters[_cnic].isRegistered, "Voter already registered");
        require(!isPendingVoter[_cnic], "Registration already pending");
        require(!registeredWallets[msg.sender], "Wallet address already registered");

        // Add to pending voters
        pendingVoters.push(_cnic);
        isPendingVoter[_cnic] = true;

        // Create voter record but mark as not approved
        voters[_cnic] = Voter({
            cnic: _cnic,
            walletAddress: msg.sender,
            isRegistered: false,
            hasVoted: false,
            isApproved: false,
            registrationTime: block.timestamp
        });

        emit VoterRegistrationSubmitted(_cnic, msg.sender);
    }

    function approveVoter(string memory _cnic) public onlyAdmin {
        require(isPendingVoter[_cnic], "No pending registration found");
        require(!voters[_cnic].isRegistered, "Voter already registered");

        Voter storage voter = voters[_cnic];
        voter.isRegistered = true;
        voter.isApproved = true;
        registeredWallets[voter.walletAddress] = true;

        // Remove from pending voters
        isPendingVoter[_cnic] = false;

        emit VoterApproved(_cnic, voter.walletAddress);
    }

    function rejectVoter(string memory _cnic) public onlyAdmin {
        require(isPendingVoter[_cnic], "No pending registration found");

        // Remove voter record
        delete voters[_cnic];
        isPendingVoter[_cnic] = false;
    }

    function getPendingVotersCount() public view returns (uint256) {
        return pendingVoters.length;
    }

    function getPendingVoterAtIndex(uint256 index) public view returns (string memory) {
        require(index < pendingVoters.length, "Index out of bounds");
        return pendingVoters[index];
    }

    function getVoterStatus(string memory _cnic) public view returns (
        bool isRegistered,
        bool isPending,
        bool isApproved,
        uint256 registrationTime
    ) {
        Voter memory voter = voters[_cnic];
        return (
            voter.isRegistered,
            isPendingVoter[_cnic],
            voter.isApproved,
            voter.registrationTime
        );
    }

    // NEW: Function to check if voter has voted in specific election
    function hasVoterVotedInElection(uint256 _electionId, string memory _cnic) public view returns (bool) {
        return hasVotedInElection[_electionId][_cnic];
    }

    function addContestant(
        string memory _name,
        uint256 _age,
        string memory _cnic,
        string memory _qualification
    ) public onlyAdmin {
        contestantCount++;
        contestants[contestantCount] = Contestant({
            id: contestantCount,
            name: _name,
            age: _age,
            cnic: _cnic,
            qualification: _qualification,
            voteCount: 0,
            isRegistered: true
        });

        emit ContestantAdded(contestantCount, _name);
    }

    function clearContestants() public onlyAdmin {
        require(currentElectionId == 0 || elections[currentElectionId].status != ElectionStatus.ACTIVE, "Cannot clear contestants while election is active");
        
        // Clear all contestants
        for (uint256 i = 1; i <= contestantCount; i++) {
            delete contestants[i];
        }
        contestantCount = 0;
    }

    // Updated createElection - no timing parameters needed
    function createElection(uint256[] memory _contestantIds) public onlyAdmin {
        require(_contestantIds.length >= 2, "Election must have at least 2 contestants");

        currentElectionId++;
        Election storage newElection = elections[currentElectionId];
        newElection.id = currentElectionId;
        newElection.status = ElectionStatus.CREATED;
        newElection.createdTime = block.timestamp;

        for (uint256 i = 0; i < _contestantIds.length; i++) {
            require(contestants[_contestantIds[i]].isRegistered, "Invalid contestant");
            newElection.contestants[_contestantIds[i]] = true;
        }

        emit ElectionCreated(currentElectionId, block.timestamp);
    }

    // New function: Start election manually
    function startElection(uint256 _electionId) public onlyAdmin {
        require(_electionId > 0 && _electionId <= currentElectionId, "Invalid election ID");
        Election storage election = elections[_electionId];
        require(election.status == ElectionStatus.CREATED, "Election is not in CREATED state");

        election.status = ElectionStatus.ACTIVE;
        election.startedTime = block.timestamp;
        
        emit ElectionStarted(_electionId, block.timestamp);
    }

    // New function: End election manually
    function endElection(uint256 _electionId) public onlyAdmin {
        require(_electionId > 0 && _electionId <= currentElectionId, "Invalid election ID");
        Election storage election = elections[_electionId];
        require(election.status == ElectionStatus.ACTIVE, "Election is not active");

        election.status = ElectionStatus.ENDED;
        election.endedTime = block.timestamp;

        emit ElectionEnded(_electionId, block.timestamp);
    }

    // FIXED: Cast vote function now tracks voting per election
    function castVote(string memory _voterCnic, uint256 _contestantId) public electionActive(currentElectionId) {
        Voter storage voter = voters[_voterCnic];
        require(voter.isRegistered, "Voter not registered");
        require(voter.walletAddress == msg.sender, "Invalid voter wallet");
        
        // FIXED: Check if voter has voted in THIS specific election instead of globally
        require(!hasVotedInElection[currentElectionId][_voterCnic], "Voter has already voted in this election");
        require(elections[currentElectionId].contestants[_contestantId], "Contestant not in current election");

        // FIXED: Mark as voted in THIS specific election only
        hasVotedInElection[currentElectionId][_voterCnic] = true;
        contestants[_contestantId].voteCount++;

        emit VoteCast(_voterCnic, _contestantId);
    }

    function getContestantDetails(uint256 _contestantId) public view returns (
        string memory name,
        uint256 age,
        string memory cnic,
        string memory qualification,
        uint256 voteCount
    ) {
        Contestant storage contestant = contestants[_contestantId];
        require(contestant.isRegistered, "Contestant not found");
        
        return (
            contestant.name,
            contestant.age,
            contestant.cnic,
            contestant.qualification,
            contestant.voteCount
        );
    }

    // Updated getElectionStatus - returns status instead of timing
    function getElectionStatus(uint256 _electionId) public view returns (
        ElectionStatus status,
        uint256 createdTime,
        uint256 startedTime,
        uint256 endedTime
    ) {
        Election storage election = elections[_electionId];
        return (
            election.status,
            election.createdTime,
            election.startedTime,
            election.endedTime
        );
    }

    function isContestantInElection(uint256 _electionId, uint256 _contestantId) public view returns (bool) {
        return elections[_electionId].contestants[_contestantId];
    }

    // Updated declareWinner - no timing check needed
    function declareWinner(uint256 _electionId) public onlyAdmin {
        Election storage election = elections[_electionId];
        require(election.status == ElectionStatus.ENDED, "Election must be ended first");
        require(!election.isResultDeclared, "Result already declared");

        uint256 maxVotes = 0;
        uint256 winnerId = 0;

        // Find contestant with maximum votes
        for (uint256 i = 1; i <= contestantCount; i++) {
            if (election.contestants[i] && contestants[i].voteCount > maxVotes) {
                maxVotes = contestants[i].voteCount;
                winnerId = i;
            }
        }

        require(winnerId > 0, "No valid winner found");

        election.isResultDeclared = true;
        election.winnerId = winnerId;

        emit WinnerDeclared(_electionId, winnerId, maxVotes);
    }

    // Updated getElectionResult
    function getElectionResult(uint256 _electionId) public view returns (
        bool isResultDeclared,
        uint256 winnerId,
        string memory winnerName,
        uint256 winnerVotes,
        ElectionStatus status,
        uint256 createdTime,
        uint256 startedTime,
        uint256 endedTime
    ) {
        Election storage election = elections[_electionId];
        
        if (election.isResultDeclared) {
            Contestant storage winner = contestants[election.winnerId];
            return (
                true,
                election.winnerId,
                winner.name,
                winner.voteCount,
                election.status,
                election.createdTime,
                election.startedTime,
                election.endedTime
            );
        }
        
        return (
            false,
            0,
            "",
            0,
            election.status,
            election.createdTime,
            election.startedTime,
            election.endedTime
        );
    }
} 