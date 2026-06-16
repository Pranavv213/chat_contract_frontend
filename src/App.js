import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import './App.css';

function App() {
  const [contractAddress, setContractAddress] = useState('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
  const [rpcUrl, setRpcUrl] = useState('https://polygon-rpc.com');
  const [abi, setAbi] = useState('');
  const [query, setQuery] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState(null);
  const [llmDecision, setLlmDecision] = useState(null);
  const [error, setError] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  // Sample ABI for testing
  const sampleAbi = `[
  {
    "inputs": [],
    "name": "name",
    "outputs": [{"type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{"type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
]`;

  useEffect(() => {
    testBackendConnection();
    setAbi(sampleAbi);
    // Add welcome message
    setMessages([{
      id: Date.now(),
      type: 'bot',
      content: '👋 Hi! I\'m your Smart Contract Assistant. Ask me anything about the smart contract!',
      timestamp: new Date()
    }]);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const testBackendConnection = async () => {
    try {
      const response = await fetch('http://localhost:8000/');
      if (response.ok) {
        setBackendStatus('connected');
        addBotMessage('✅ Backend is connected and ready!');
      } else {
        setBackendStatus('error');
        addBotMessage('❌ Backend connection failed. Please make sure the backend server is running.');
      }
    } catch (error) {
      setBackendStatus('error');
      addBotMessage('❌ Cannot connect to backend. Please start the backend server with: python app.py');
    }
  };

  const addBotMessage = (content) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'bot',
      content: content,
      timestamp: new Date()
    }]);
  };

  const addUserMessage = (content) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'user',
      content: content,
      timestamp: new Date()
    }]);
  };

  const addSystemMessage = (content, isError = false) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: 'system',
      content: content,
      isError: isError,
      timestamp: new Date()
    }]);
  };

  const handleSubmit = async () => {
    // Validation
    if (!contractAddress || !contractAddress.startsWith('0x')) {
      addSystemMessage('Please enter a valid contract address', true);
      return;
    }
    
    if (!rpcUrl) {
      addSystemMessage('Please enter an RPC URL', true);
      return;
    }
    
    if (!abi) {
      addSystemMessage('Please paste the contract ABI', true);
      return;
    }
    
    if (!query) {
      addSystemMessage('Please enter your question', true);
      return;
    }

    // Add user message to chat
    addUserMessage(query);
    
    setLoading(true);
    setError('');
    setResult(null);
    setLlmDecision(null);

    try {
      // Parse ABI
      let parsedAbi;
      try {
        parsedAbi = JSON.parse(abi);
      } catch (e) {
        throw new Error('Invalid ABI JSON format');
      }
      
      addSystemMessage('🤖 AI is analyzing your question...');
      
      // Step 1: Call backend
      const response = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_address: contractAddress,
          abi: parsedAbi,
          query: query
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Backend error');
      }
      
      // Store LLM decision
      setLlmDecision({
        function_name: data.function,
        parameters: data.parameters,
        available_functions: data.available_functions
      });
      
      addSystemMessage(`🎯 AI decided to call: ${data.function}(${data.parameters.map(p => `"${p}"`).join(', ')})`);
      
      // Step 2: Call contract
      if (data.function && data.function !== '') {
        addSystemMessage(`⛓️ Calling ${data.function}() on the blockchain...`);
        
        // Create provider
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Create contract
        const contract = new ethers.Contract(contractAddress, parsedAbi, provider);
        
        // Check if function exists
        if (!contract[data.function]) {
          throw new Error(`Function "${data.function}" not found`);
        }
        
        // Call the function
        let contractResult;
        if (data.parameters && data.parameters.length > 0) {
          contractResult = await contract[data.function](...data.parameters);
        } else {
          contractResult = await contract[data.function]();
        }
        
        // Format result
        let formattedResult;
        if (typeof contractResult === 'bigint') {
          formattedResult = contractResult.toString();
        } else if (typeof contractResult === 'string') {
          formattedResult = contractResult;
        } else if (contractResult && contractResult.toString) {
          formattedResult = contractResult.toString();
        } else {
          formattedResult = JSON.stringify(contractResult, null, 2);
        }
        
        setResult(formattedResult);
        
        // Add bot response with the result
        addBotMessage(`Here's what I found:\n\n${formattedResult}`);
        
      } else {
        throw new Error('Could not determine which function to call');
      }
      
    } catch (err) {
      console.error('Error:', err);
      let errorMsg;
      if (err.message.includes('could not detect network')) {
        errorMsg = 'Cannot connect to blockchain. Please check the RPC URL';
      } else if (err.message.includes('function not found')) {
        errorMsg = `Function not found in contract. Available functions: ${llmDecision?.available_functions?.join(', ')}`;
      } else {
        errorMsg = err.message;
      }
      addSystemMessage(`❌ Error: ${errorMsg}`, true);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadSample = () => {
    setContractAddress('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
    setRpcUrl('https://polygon-rpc.com');
    setAbi(sampleAbi);
    setQuery('');
    setError('');
    addSystemMessage('📋 Loaded USDC contract on Polygon as sample');
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="App">
      <div className="chat-container">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>🤖 Smart Contract Assistant</h2>
            <div className={`status-badge ${backendStatus}`}>
              {backendStatus === 'connected' ? '🟢 Online' : '🔴 Offline'}
            </div>
          </div>
          
          <div className="config-section">
            <button onClick={loadSample} className="sample-chat-btn">
              📋 Load Sample Contract
            </button>
            
            <div className="config-group">
              <label>📍 Contract Address</label>
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="0x..."
                disabled={loading}
              />
            </div>
            
            <div className="config-group">
              <label>🔗 RPC URL</label>
              <input
                type="text"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                placeholder="https://..."
                disabled={loading}
              />
            </div>
            
            <div className="config-group">
              <label>📄 Contract ABI</label>
              <textarea
                rows={4}
                value={abi}
                onChange={(e) => setAbi(e.target.value)}
                disabled={loading}
                placeholder="Paste ABI here..."
              />
            </div>
          </div>
        </div>
        
        {/* Chat Area */}
        <div className="chat-area">
          <div className="chat-header">
            <h3>💬 Conversation</h3>
            <button 
              onClick={() => {
                setMessages([{
                  id: Date.now(),
                  type: 'bot',
                  content: '👋 Hi! I\'m your Smart Contract Assistant. Ask me anything about the smart contract!',
                  timestamp: new Date()
                }]);
                setResult(null);
                setLlmDecision(null);
                setError('');
              }} 
              className="clear-chat-btn"
            >
              🗑️ Clear Chat
            </button>
          </div>
          
          <div className="messages-container">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.type}`}>
                <div className="message-avatar">
                  {message.type === 'user' ? '👤' : message.type === 'bot' ? '🤖' : '⚙️'}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">
                      {message.type === 'user' ? 'You' : message.type === 'bot' ? 'Assistant' : 'System'}
                    </span>
                    <span className="message-time">{formatTime(message.timestamp)}</span>
                  </div>
                  <div className={`message-text ${message.isError ? 'error' : ''}`}>
                    {message.content.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="message bot">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">Assistant</span>
                  </div>
                  <div className="message-text loading">
                    <span className="loading-dots">{loadingStep || 'Processing...'}</span>
                  </div>
                </div>
              </div>
            )}
            
            {llmDecision && llmDecision.function_name && !loading && (
              <div className="message system">
                <div className="message-avatar">⚙️</div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">Debug Info</span>
                  </div>
                  <div className="message-text debug">
                    <details>
                      <summary>🔧 View AI Decision Details</summary>
                      <p><strong>Function:</strong> <code>{llmDecision.function_name}()</code></p>
                      <p><strong>Parameters:</strong> <code>{JSON.stringify(llmDecision.parameters)}</code></p>
                      <p><strong>Available Functions:</strong> {llmDecision.available_functions?.join(', ')}</p>
                    </details>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          <div className="input-area">
            <div className="input-wrapper">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask something about the contract... (e.g., 'What is the name?' or 'Total supply')"
                disabled={loading || backendStatus !== 'connected'}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                className="chat-input"
              />
              <button 
                onClick={handleSubmit} 
                disabled={loading || backendStatus !== 'connected'}
                className="send-btn"
              >
                {loading ? '⏳' : '📤'}
              </button>
            </div>
            <div className="input-hint">
              💡 Example questions: "What is the name?" | "Total supply" | "Token symbol"
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;