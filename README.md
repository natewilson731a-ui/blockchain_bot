# Block Vote - Decentralized Voting System

A secure and transparent voting system built on the Ethereum blockchain, featuring admin and user portals with OTP-based registration.

## Features

- **Blockchain Integration**: Secure voting using Ethereum smart contracts
- **MetaMask Integration**: Easy wallet connection and transaction signing
- **Email Verification**: Two-step verification process with OTP
- **Admin Portal**: 
  - Approve voter registrations
  - Add contestants
  - Create and schedule elections
- **Voter Portal**:
  - Secure registration with email verification
  - Vote casting with MetaMask
  - Real-time election results
- **Modern UI**: Built with React and Chakra UI
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MetaMask browser extension
- Ganache for local blockchain
- Gmail account for sending OTP emails

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd block-vote
   ```

2. **Install Dependencies**
   ```bash
   # Install root dependencies
   npm install

   # Install client dependencies
   cd client
   npm install

   # Install server dependencies
   cd ../server
   npm install
   ```

3. **Configure Environment Variables**
   
   Create a `.env` file in the server directory:
   ```
   PORT=5000
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASS=your-app-specific-password
   JWT_SECRET=your-secret-key
   ```

4. **Setup Ganache**
   - Install and run Ganache
   - Create a new workspace
   - Import the provided truffle-config.js
   - Note down the RPC Server URL (usually http://127.0.0.1:7545)

5. **Deploy Smart Contracts**
   ```bash
   cd contracts
   truffle migrate --network development
   ```

6. **Start the Application**
   ```bash
   # Start the server (from root directory)
   cd server
   npm start

   # Start the client (in a new terminal)
   cd client
   npm start
   ```

7. **Access the Application**
   - Open http://localhost:3000 in your browser
   - Ensure MetaMask is connected to your Ganache network

## Smart Contract Details

The voting system uses the following smart contracts:

- `VotingSystem.sol`: Main contract handling voter registration, contestant management, and vote casting

### Contract Functions

- `registerVoter`: Admin function to register approved voters
- `addContestant`: Admin function to add election contestants
- `createElection`: Admin function to create and schedule elections
- `castVote`: Voter function to cast votes in active elections
- `getContestantDetails`: Public function to view contestant information
- `getElectionStatus`: Public function to check election status

## Security Features

- OTP-based email verification
- Password hashing using bcrypt
- JWT-based authentication
- MetaMask wallet verification
- Smart contract access control
- Input validation and sanitization

## Development Notes

- The system uses SQLite for development. For production, consider using PostgreSQL or MySQL
- Email service uses Gmail SMTP. For production, consider using services like SendGrid or AWS SES
- The smart contract is deployed on Ganache for development. For production, deploy to Ethereum mainnet or a suitable testnet

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License


This project is licensed under the MIT License - see the LICENSE file for details 
