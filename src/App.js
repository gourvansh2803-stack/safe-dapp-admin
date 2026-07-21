import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css'; // Make sure your dark theme CSS is here

const CONTRACT_ADDRESS = "0x902fe61bd6E334D66f3D8c983471c10884c10F4d";
const ADMIN_WALLET = "0x70eEFEd646d12AB2A352D61aFc40947F5187797c".toLowerCase();

// 🔥 UPDATED ABI: Added "users" mapping to fetch exact signup date/time
const CONTRACT_ABI = [
  "function isPaused() view returns (bool)",
  "function signupFee() view returns (uint256)",
  "function referralPercentage() view returns (uint256)",
  "function botWallet() view returns (address)",
  "function renewalInterval() view returns (uint256)",
  "function renewalEnabled() view returns (bool)",
  "function pauseSystem() external",
  "function resumeSystem() external",
  "function setAdminSettings(uint256 _fee, uint256 _refPercent, uint256 _days, bool _renewal) external",
  "function setBotWallet(address _newBot) external",
  "function setWhitelist(address _user, bool _status) external",
  "function emergencyWithdraw(address _token) external",
  "function getAllUsersDetailedData() external view returns (address[])",
  "function getUserTransferHistory(address _user) external view returns (tuple(uint256 amount, uint256 timestamp, address destination)[])",
  "function users(address) view returns (bool isRegistered, address destinationWallet, uint256 totalForwarded, uint256 lastSignupTime, bool isWhitelisted)"
];

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [account, setAccount] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  
  // Dashboard Stats
  const [currentFee, setCurrentFee] = useState("0");
  const [currentRef, setCurrentRef] = useState("0");
  const [currentBot, setCurrentBot] = useState("");
  const [usersList, setUsersList] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [liveHistory, setLiveHistory] = useState([]);

  // Search States
  const [searchUser, setSearchUser] = useState("");
  const [searchDest, setSearchDest] = useState("");

  // Input States
  const [feeInput, setFeeInput] = useState("");
  const [refInput, setRefInput] = useState("0");
  const [renewalDaysInput, setRenewalDaysInput] = useState("30");
  const [renewalEnabledInput, setRenewalEnabledInput] = useState(false);
  
  const [botInput, setBotInput] = useState("");
  const [whitelistAddress, setWhitelistAddress] = useState("");
  const [whitelistStatus, setWhitelistStatus] = useState(true);
  const [withdrawTokenAddress, setWithdrawTokenAddress] = useState("");

  const fetchDashboardData = async (signer) => {
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const [pausedStatus, fee, refPercent, bot] = await Promise.all([
        contract.isPaused(),
        contract.signupFee(),
        contract.referralPercentage(),
        contract.botWallet()
      ]);
      
      setIsPaused(pausedStatus);
      setCurrentFee(ethers.formatUnits(fee, 18));
      setCurrentRef(refPercent.toString());
      setCurrentBot(bot);

      // Fetch Users List
      const allUserAddresses = await contract.getAllUsersDetailedData();
      setTotalUsers(allUserAddresses.length);

      // Fetch Dashboard Data for each user using "users" mapping to get lastSignupTime
      const userDetailsPromises = allUserAddresses.map(addr => contract.users(addr));
      const userDetails = await Promise.all(userDetailsPromises);

      const formattedUsers = allUserAddresses.map((addr, index) => {
        const ud = userDetails[index];
        return {
          id: index + 1, // User ID based on array index
          userWallet: addr,
          destinationWallet: ud[1], // Destination
          totalForwarded: ud[2],     // Total Forwarded
          regTime: new Date(Number(ud[3]) * 1000).toLocaleString() // Converted Registration Date & Time
        };
      });
      setUsersList(formattedUsers);

      // Fetch History for each user
      const historyPromises = allUserAddresses.map(addr => contract.getUserTransferHistory(addr));
      const allHistories = await Promise.all(historyPromises);

      let fullHistory = [];
      allUserAddresses.forEach((addr, index) => {
        const userId = index + 1;
        allHistories[index].forEach(tx => {
          fullHistory.push({
            userId,
            user: addr,
            destination: tx.destination,
            amount: ethers.formatUnits(tx.amount, 18),
            rawTime: Number(tx.timestamp),
            time: new Date(Number(tx.timestamp) * 1000).toLocaleString()
          });
        });
      });

      fullHistory.sort((a, b) => b.rawTime - a.rawTime);
      setLiveHistory(fullHistory.slice(0, 100)); // 🔥 Keep latest 100 instead of 20
    } catch (err) { console.error("Data fetch error:", err); }
  };

  useEffect(() => {
    if (!isAdmin) return;
    const loadData = async () => {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      fetchDashboardData(signer);
    };
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const connectAdmin = async () => {
    if (!window.ethereum) return alert("MetaMask is required!");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      if (address.toLowerCase() === ADMIN_WALLET) {
        setAccount(address);
        setIsAdmin(true);
      } else { alert("Access Denied! You are not the admin."); }
    } catch (error) { console.error("Login failed", error); }
  };

  // --- SMART CONTRACT ACTIONS ---

  const togglePauseStatus = async () => {
    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await (isPaused ? contract.resumeSystem() : contract.pauseSystem());
      await tx.wait();
      fetchDashboardData(signer);
    } catch (err) { alert("Action Failed: " + err.message); }
  };

  const handleAdminSettings = async () => {
    try {
      if(!feeInput) return alert("Enter Signup Fee");
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.setAdminSettings(
        ethers.parseUnits(feeInput, 18), 
        refInput, 
        renewalDaysInput, 
        renewalEnabledInput
      );
      await tx.wait();
      alert("Settings Updated!");
      fetchDashboardData(signer);
    } catch (err) { alert("Failed: " + err.message); }
  };

  const handleSetBot = async () => {
    try {
      if(!ethers.isAddress(botInput)) return alert("Invalid Address");
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.setBotWallet(botInput);
      await tx.wait();
      alert("Bot Wallet Updated!");
      setBotInput("");
      fetchDashboardData(signer);
    } catch (err) { alert("Failed: " + err.message); }
  };

  const handleWhitelist = async () => {
    try {
      if(!ethers.isAddress(whitelistAddress)) return alert("Invalid Address");
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.setWhitelist(whitelistAddress, whitelistStatus);
      await tx.wait();
      alert(`User Whitelist status set to ${whitelistStatus}`);
      setWhitelistAddress("");
    } catch (err) { alert("Failed: " + err.message); }
  };

  const handleEmergencyWithdraw = async () => {
    try {
      if(!ethers.isAddress(withdrawTokenAddress)) return alert("Invalid Token Address");
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.emergencyWithdraw(withdrawTokenAddress);
      await tx.wait();
      alert("Funds Withdrawn Successfully!");
      setWithdrawTokenAddress("");
    } catch (err) { alert("Failed: " + err.message); }
  };

  // --- FILTER USERS LOGIC ---
  const filteredUsers = usersList.filter(user => 
    user.userWallet.toLowerCase().includes(searchUser.toLowerCase()) && 
    user.destinationWallet.toLowerCase().includes(searchDest.toLowerCase())
  );

  // --- RENDER UI ---

  if (!isAdmin) return (
    <div className="login-container" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#0f172a', color: '#fff'}}>
      <h1>Fund Safer <span style={{ color: '#ec4899' }}>Admin</span></h1>
      <button onClick={connectAdmin} style={{padding: '12px 24px', backgroundColor: '#ec4899', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '20px'}}>Connect Admin Wallet</button>
    </div>
  );

  return (
    <div className="dashboard-container" style={{backgroundColor: '#0f172a', minHeight: '100vh', padding: '20px', color: '#e2e8f0', fontFamily: 'sans-serif'}}>
      
      {/* Header Section */}
      <div className="header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', marginBottom: '20px'}}>
        <div>
          <h2 style={{margin: '0 0 5px 0', color: '#fff'}}>Admin Control Panel</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>Wallet: {account}</p>
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>Bot Wallet: {currentBot}</p>
        </div>
        <span style={{padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', backgroundColor: isPaused ? '#ef4444' : '#10b981', color: '#fff'}}>
          System: {isPaused ? 'PAUSED' : 'ACTIVE'}
        </span>
      </div>

      {/* Control Panels Grid */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px'}}>
        
        {/* Card 1: Emergency System */}
        <div style={{backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155'}}>
          <h3 style={{marginTop: 0, color: '#fff'}}>Emergency System</h3>
          <p style={{color: '#94a3b8', fontSize: '14px'}}>Pause or Resume contract functions</p>
          <button onClick={togglePauseStatus} style={{width: '100%', padding: '10px', backgroundColor: isPaused ? '#10b981' : '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
            {isPaused ? "▶ Resume System" : "⏸ Pause System"}
          </button>
        </div>

        {/* Card 2: Core Admin Settings */}
        <div style={{backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155'}}>
          <h3 style={{marginTop: 0, color: '#fff'}}>Admin Settings</h3>
          <p style={{color: '#94a3b8', fontSize: '14px', marginBottom: '10px'}}>Current Fee: {currentFee} USDT | Ref: {currentRef}</p>
          
          <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
            <input type="number" placeholder="Fee (USDT)" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} style={{flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} />
            <input type="number" placeholder="Ref % (e.g. 1000 = 10%)" value={refInput} onChange={(e) => setRefInput(e.target.value)} style={{flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} />
          </div>
          
          <div style={{display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center'}}>
            <input type="number" placeholder="Days (e.g. 30)" value={renewalDaysInput} onChange={(e) => setRenewalDaysInput(e.target.value)} style={{flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} />
            <label style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', color: '#94a3b8'}}>
              <input type="checkbox" checked={renewalEnabledInput} onChange={(e) => setRenewalEnabledInput(e.target.checked)} />
              Enable Renewal
            </label>
          </div>

          <button onClick={handleAdminSettings} style={{width: '100%', padding: '10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
            Update Settings
          </button>
        </div>

        {/* Card 3: Bot & Whitelist Management */}
        <div style={{backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155'}}>
          <h3 style={{marginTop: 0, color: '#fff'}}>Bot & Whitelist</h3>
          
          <div style={{display: 'flex', gap: '10px', marginBottom: '15px'}}>
            <input type="text" placeholder="New Bot Address" value={botInput} onChange={(e) => setBotInput(e.target.value)} style={{flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} />
            <button onClick={handleSetBot} style={{padding: '8px 15px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer'}}>Set Bot</button>
          </div>

          <div style={{display: 'flex', gap: '10px', marginBottom: '5px'}}>
            <input type="text" placeholder="User Wallet to Whitelist" value={whitelistAddress} onChange={(e) => setWhitelistAddress(e.target.value)} style={{flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} />
            <select value={whitelistStatus} onChange={(e) => setWhitelistStatus(e.target.value === 'true')} style={{padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}}>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </div>
          <button onClick={handleWhitelist} style={{width: '100%', padding: '10px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop:'5px'}}>Update Whitelist</button>
        </div>

        {/* Card 4: Emergency Withdraw */}
        <div style={{backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155'}}>
          <h3 style={{marginTop: 0, color: '#ef4444'}}>Emergency Withdraw</h3>
          <p style={{color: '#94a3b8', fontSize: '14px', marginBottom: '10px'}}>Withdraw tokens trapped in contract</p>
          <div style={{display: 'flex', gap: '10px'}}>
            <input type="text" placeholder="Token Contract Address" value={withdrawTokenAddress} onChange={(e) => setWithdrawTokenAddress(e.target.value)} style={{flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} />
            <button onClick={handleEmergencyWithdraw} style={{padding: '8px 15px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer'}}>Withdraw</button>
          </div>
        </div>

      </div>

      {/* Directory Table */}
      <div style={{backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '30px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
          <h3 style={{marginTop: 0, color: '#fff'}}>Registered Users <span style={{backgroundColor: '#10b981', padding: '2px 8px', borderRadius: '10px', fontSize: '14px', marginLeft: '10px'}}>{totalUsers}</span></h3>
        </div>
        
        {/* 🔥 NEW: Wallet Search Section */}
        <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
          <input 
            type="text" 
            placeholder="🔍 Search User Wallet..." 
            value={searchUser} 
            onChange={(e) => setSearchUser(e.target.value)} 
            style={{flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} 
          />
          <input 
            type="text" 
            placeholder="🔍 Search Destination Wallet..." 
            value={searchDest} 
            onChange={(e) => setSearchDest(e.target.value)} 
            style={{flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff'}} 
          />
        </div>

        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
            <thead>
              <tr style={{borderBottom: '2px solid #334155', color: '#94a3b8', fontSize: '12px'}}>
                <th style={{padding: '12px'}}># ID</th>
                <th style={{padding: '12px'}}>REG. DATE & TIME</th> {/* 🔥 NEW: Date & Time Column */}
                <th style={{padding: '12px'}}>USER WALLET</th>
                <th style={{padding: '12px'}}>DESTINATION</th>
                <th style={{padding: '12px'}}>FORWARDED (USDT)</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} style={{borderBottom: '1px solid #334155'}}>
                  <td style={{padding: '12px', color: '#3b82f6', fontWeight: 'bold'}}>#{user.id}</td>
                  <td style={{padding: '12px', color: '#94a3b8', fontSize: '13px'}}>{user.regTime}</td> {/* 🔥 NEW: Renders Time */}
                  <td style={{padding: '12px', fontFamily: 'monospace', color: '#e2e8f0'}}>{user.userWallet}</td>
                  <td style={{padding: '12px', fontFamily: 'monospace', color: '#94a3b8'}}>{user.destinationWallet}</td>
                  <td style={{padding: '12px', color: '#10b981', fontWeight: 'bold'}}>{ethers.formatUnits(user.totalForwarded, 18)}</td>
                </tr>
              ))}
              {filteredUsers.length === 0 && <tr><td colSpan="5" style={{padding: '20px', textAlign: 'center', color: '#94a3b8'}}>No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Table */}
      <div style={{backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155'}}>
        <h3 style={{marginTop: 0, color: '#fff'}}>Transfer History (Latest 100)</h3> {/* 🔥 UPDATED: Latest 100 text */}
        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
            <thead>
              <tr style={{borderBottom: '2px solid #334155', color: '#94a3b8', fontSize: '12px'}}>
                <th style={{padding: '12px'}}>TIME</th>
                <th style={{padding: '12px'}}>USER ID</th>
                <th style={{padding: '12px'}}>FROM (USER)</th>
                <th style={{padding: '12px'}}>TO (DESTINATION)</th>
                <th style={{padding: '12px'}}>AMOUNT (USDT)</th>
              </tr>
            </thead>
            <tbody>
              {liveHistory.map((tx, i) => (
                <tr key={i} style={{borderBottom: '1px solid #334155'}}>
                  <td style={{padding: '12px', fontSize: '12px', color: '#94a3b8'}}>{tx.time}</td>
                  <td style={{padding: '12px', color: '#3b82f6', fontWeight: 'bold'}}>#{tx.userId}</td>
                  <td style={{padding: '12px', fontFamily: 'monospace', color: '#e2e8f0'}}>{tx.