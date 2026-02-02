const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Minimal contract deployment (only updating imported files)...\n');

// Step 1: Deploy contracts
console.log('📝 Compiling and deploying contracts...');
exec('cd contracts && npx truffle migrate --reset --network development', (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Deployment failed:', error);
    return;
  }
  
  console.log('✅ Contract deployed successfully!\n');
  console.log(stdout);
  
  // Step 2: Update only the files that are actually imported
  console.log('📋 Updating ONLY the imported contract files...\n');
  
  const contractSource = path.join(__dirname, 'contracts', 'build', 'contracts', 'VotingSystem.json');
  const importedFiles = [
    {
      dest: path.join(__dirname, 'server', 'VotingSystem.json'),
      usage: 'Server imports this'
    },
    {
      dest: path.join(__dirname, 'client', 'src', 'contracts', 'build', 'contracts', 'VotingSystem.json'),
      usage: 'Client imports this'
    }
  ];
  
  importedFiles.forEach(({ dest, usage }) => {
    try {
      // Create directories if they don't exist
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Copy file
      fs.copyFileSync(contractSource, dest);
      console.log(`✅ Updated: ${dest}`);
      console.log(`   └─ ${usage}`);
    } catch (err) {
      console.error(`❌ Failed to update ${dest}:`, err.message);
    }
  });
  
  // Show what we're NOT updating
  console.log('\n❌ NOT updating (not imported by anyone):');
  console.log('   • client/src/contracts/VotingSystem.json');
  
  // Step 3: Show new contract address
  try {
    const contractData = JSON.parse(fs.readFileSync(contractSource, 'utf8'));
    const networks = contractData.networks;
    const networkIds = Object.keys(networks);
    
    if (networkIds.length > 0) {
      const latestNetwork = networks[networkIds[networkIds.length - 1]];
      console.log(`\n🎯 New Contract Address: ${latestNetwork.address}`);
      console.log(`📍 Network ID: ${networkIds[networkIds.length - 1]}`);
    }
  } catch (err) {
    console.error('❌ Could not extract contract address:', err.message);
  }
  
  console.log('\n🎉 Minimal deployment complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Restart your server');
  console.log('2. Refresh your browser');
  console.log('3. Create new election');
}); 