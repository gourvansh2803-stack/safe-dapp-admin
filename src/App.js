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
  // eslint-disable-next-line no-unused-vars
  const [isAdmin, setIsAdmin] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [account, setAccount] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [currentFee, setCurrentFee] = useState("0");
  // eslint-disable-next-line no-unused-vars
  const [newFeeInput, setNewFeeInput] = useState("");
  const [usersList, setUsersList] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [liveHistory, setLiveHistory] = useState([]);

  const fetchDashboardData = async (signer) => {
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const [pausedStatus, fee, allUsers] = await Promise.all([
        contract.isPaused(),
        contract.signupFee(),
        contract.getAllUsersDetailedData()
      ]);
      
      setIsPaused(pausedStatus);
      setCurrentFee(ethers.formatUnits(fee, 18));
      setUsersList(allUsers);
      setTotalUsers(allUsers.length);

      const historyPromises = allUsers.map(user => contract.getUserTransferHistory(user.userWallet));
      const allHistories = await Promise.all(historyPromises);

      let fullHistory = [];
      allUsers.forEach((user, index) => {
        const userId = index + 1;
        allHistories[index].forEach(tx => {
          fullHistory.push({
            userId,
            user: user.userWallet,
            destination: tx.destination,
            amount: ethers.formatUnits(tx.amount, 18),
            rawTime: Number(tx.timestamp),
            time: new Date(Number(tx.timestamp) * 1000).toLocaleString()
          });
        });
      });

      fullHistory.sort((a, b) => b.rawTime - a.rawTime);
      setLiveHistory(fullHistory.slice(0, 20));
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
      } else {
        alert("Access Denied!");
      }
    } catch (error) { console.error("Login failed", error); }
  };

  const handleUpdateFee = async () => {
    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.setSignupFee(ethers.parseUnits(newFeeInput, 18));
      await tx.wait();
      alert("Updated!");
      fetchDashboardData(signer);
    } catch (err) { alert("Failed"); }
  };

  const togglePauseStatus = async () => {
    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      await (isPaused ? contract.resumeSystem() : contract.pauseSystem()).then(tx => tx.wait());
      fetchDashboardData(signer);
    } catch (err) { alert("Failed"); }
  };

  if (!isAdmin) return (
    <div className="login-container">
      <h1>Fund Safer <span style={{ color: '#ec4899' }}>Admin</span></h1>
      <button onClick={connectAdmin} className="btn-primary">Connect Admin Wallet</button>
    </div>
  );

  return (
    <div className="dashboard-container">
      <div className="header">
        <h2>Admin Control Panel</h2>
        <span className={`badge ${isPaused ? 'badge-paused' : 'badge-active'}`}>System: {isPaused ? 'PAUSED' : 'ACTIVE'}</span>
      </div>

      <div className="card">
        <h3>Registered Users Directory</h3>
        <div className="table-container">
          <table>
            <thead><tr><th>#</th><th>User Wallet</th><th>Destination</th><th>Forwarded</th></tr></thead>
            <tbody>
              {usersList.map((user, i) => (
                <tr key={i}>
                  <td><strong>{i + 1}</strong></td>
                  <td style={{fontFamily:'monospace'}}>{user.userWallet}</td>
                  <td style={{fontFamily:'monospace'}}>{user.destinationWallet}</td>
                  <td>{ethers.formatUnits(user.totalForwarded, 18)} USDT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Transfer History (Latest 20)</h3>
        <div className="table-container">
          <table>
            <thead><tr><th>#</th><th>Time</th><th>User ID</th><th>Destination</th><th>Amount</th></tr></thead>
            <tbody>
              {liveHistory.map((tx, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{tx.time}</td>
                  <td><strong>#{tx.userId}</strong></td>
                  <td style={{fontFamily:'monospace'}}>{tx.destination}</td>
                  <td>+{tx.amount} USDT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;