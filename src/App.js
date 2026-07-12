import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

const CONTRACT_ADDRESS = "0xE1AE1940b0e435cBb7f3D6F1e3B3C947C17e9b52";
const ADMIN_WALLET = "0x70eEFEd646d12AB2A352D61aFc40947F5187797c".toLowerCase();

const CONTRACT_ABI = [
  "function signupFee() view returns (uint256)",
  "function setSignupFee(uint256 _newFee) external",
  "function isPaused() view returns (bool)",
  "function pauseSystem() external",
  "function resumeSystem() external",
  "function getAllUsersDetailedData() external view returns (tuple(address userWallet, bool isRegistered, address destinationWallet, uint256 totalForwarded)[])",
  "function getUserTransferHistory(address _user) external view returns (tuple(uint256 amount, uint256 timestamp, address destination)[])"
];

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [account, setAccount] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [currentFee, setCurrentFee] = useState("0");
  const [newFeeInput, setNewFeeInput] = useState("");
  
  const [usersList, setUsersList] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [liveHistory, setLiveHistory] = useState([]);

  // FAST Data Fetch Function
  const fetchDashboardData = async (signer) => {
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const pausedStatus = await contract.isPaused();
      setIsPaused(pausedStatus);

      const fee = await contract.signupFee();
      setCurrentFee(ethers.formatUnits(fee, 18));

      // 1. Saare Users nikal lo
      const allUsers = await contract.getAllUsersDetailedData();
      setUsersList(allUsers);
      setTotalUsers(allUsers.length);

      // 2. Har user ki history ek sath PARALLEL fetch karo (Speed ke liye)
      const historyPromises = allUsers.map(user => contract.getUserTransferHistory(user.userWallet));
      const allHistories = await Promise.all(historyPromises);

      let fullHistory = [];
      
      allUsers.forEach((user, index) => {
        const userHistory = allHistories[index];
        for (let j = 0; j < userHistory.length; j++) {
          fullHistory.push({
            user: user.userWallet,
            destination: userHistory[j].destination,
            amount: ethers.formatUnits(userHistory[j].amount, 18),
            rawTime: Number(userHistory[j].timestamp), // Sorting ke liye
            time: new Date(Number(userHistory[j].timestamp) * 1000).toLocaleString()
          });
        }
      });

      // Time ke hisaab se sort karo (Sabse naya sabse upar)
      fullHistory.sort((a, b) => b.rawTime - a.rawTime);
      
      // NAYA: Sirf latest 20 transactions hi set karo!
      setLiveHistory(fullHistory.slice(0, 20));

    } catch (err) {
      console.error("Data fetch error:", err);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;

    const loadData = async () => {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      fetchDashboardData(signer);
    };
    loadData();

    // Har 15 second mein apne aap naya data check karega
    const interval = setInterval(() => {
      loadData();
    }, 15000);

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
      } else {
        alert("Access Denied: You are not the Admin!");
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleUpdateFee = async () => {
    if (newFeeInput === "") return alert("Please enter a valid amount");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const feeInWei = ethers.parseUnits(newFeeInput, 18);
      const tx = await contract.setSignupFee(feeInWei);
      await tx.wait();
      
      alert("Signup Fee Updated Successfully!");
      fetchDashboardData(signer); 
      setNewFeeInput("");
    } catch (err) {
      alert("Transaction Failed! Check console.");
    }
  };

  const togglePauseStatus = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      let tx;
      if (isPaused) tx = await contract.resumeSystem();
      else tx = await contract.pauseSystem();
      
      await tx.wait();
      alert(`System has been ${isPaused ? 'Resumed' : 'Paused'} successfully!`);
      fetchDashboardData(signer); 
    } catch (err) {
      alert("Failed to change system status!");
    }
  };

  if (!isAdmin) {
    return (
      <div className="login-container">
        <h1 style={{ fontSize: '40px', marginBottom: '10px' }}>Fund Safer <span style={{ color: '#ec4899' }}>Admin</span></h1>
        <p style={{ color: '#a0aec0', marginBottom: '40px' }}>Secure Administration Gateway</p>
        <button onClick={connectAdmin} className="btn-primary">Connect Admin Wallet</button>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="header">
        <div>
          <h2>Admin Control Panel</h2>
          <p style={{ color: '#a0aec0', fontSize: '14px' }}>Wallet: {account}</p>
        </div>
        <div>
          <span className={`badge ${isPaused ? 'badge-paused' : 'badge-active'}`}>
            System: {isPaused ? 'PAUSED' : 'ACTIVE'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div className="card" style={{ flex: '1', minWidth: '300px', marginBottom: '0' }}>
          <h3>Emergency Controls</h3>
          <p style={{ color: '#a0aec0', fontSize: '14px', marginBottom: '20px' }}>Pause the bot to stop all auto-forwarding transactions.</p>
          <button onClick={togglePauseStatus} className={isPaused ? "btn-success" : "btn-danger"}>
            {isPaused ? "▶ Resume System" : "⏸ Pause System"}
          </button>
        </div>

        <div className="card" style={{ flex: '1', minWidth: '300px', marginBottom: '0' }}>
          <h3>Signup Fee Settings</h3>
          <p style={{ color: '#a0aec0', fontSize: '14px', marginBottom: '20px' }}>Current Fee: <span className="text-pink">{currentFee} USDT</span></p>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input 
              type="number" placeholder="New fee..." className="input-field"
              value={newFeeInput} onChange={(e) => setNewFeeInput(e.target.value)}
            />
            <button onClick={handleUpdateFee} className="btn-primary">Update</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Registered Users Directory</h3>
          <span className="badge badge-active">Total Users: {totalUsers}</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>User Wallet</th>
                <th>Destination Wallet</th>
                <th>Total Forwarded</th>
              </tr>
            </thead>
            <tbody>
              {usersList.length === 0 ? (
                <tr><td colSpan="3" style={{ textAlign: 'center', color: '#a0aec0' }}>No users found yet.</td></tr>
              ) : (
                usersList.map((user, index) => (
                  <tr key={index}>
                    <td style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{user.userWallet}</td>
                    <td style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{user.destinationWallet}</td>
                    <td className="text-green">{ethers.formatUnits(user.totalForwarded, 18)} USDT</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Transfer History (Latest 20)</h3>
          <span className="badge" style={{ backgroundColor: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', border: '1px solid #ec4899' }}>🟢 AUTO-SYNCING</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>From (User)</th>
                <th>To (Destination)</th>
                <th>Amount Forwarded</th>
              </tr>
            </thead>
            <tbody>
              {liveHistory.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', color: '#a0aec0' }}>Loading history or no transactions yet...</td></tr>
              ) : (
                liveHistory.map((tx, index) => (
                  <tr key={index}>
                    <td style={{ color: '#a0aec0', fontSize: '12px' }}>{tx.time}</td>
                    <td style={{ fontFamily: 'monospace' }}>{tx.user}</td>
                    <td style={{ fontFamily: 'monospace' }}>{tx.destination}</td>
                    <td className="text-pink">+{tx.amount} USDT</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

export default App;