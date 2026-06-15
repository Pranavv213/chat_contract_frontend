import React, { useState, useEffect } from 'react';
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
    // Set sample ABI for testing
    setAbi(sampleAbi);
  }, []);

  const testBackendConnection = async () => {
    try {
      const response = await fetch('http://localhost:8000/');
      if (response.ok) {
        setBackendStatus('connected');
      } else {
        setBackendStatus('error');
      }
    } catch (error) {
      setBackendStatus('error');
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!contractAddress || !contractAddress.startsWith('0x')) {
      setError('Please enter a valid contract address');
      return;
    }
    
    if (!rpcUrl) {
      setError('Please enter an RPC URL');
      return;
    }
    
    if (!abi) {
      setError('Please paste the contract ABI');
      return;
    }
    
    if (!query) {
      setError('Please enter your question');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setLlmDecision(null);

    try {
      // Parse ABI
      setLoadingStep('Parsing ABI...');
      let parsedAbi;
      try {
        parsedAbi = JSON.parse(abi);
      } catch (e) {
        throw new Error('Invalid ABI JSON format');
      }
      
      // Step 1: Call backend
      setLoadingStep('🤖 Asking AI...');
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
      
      // Step 2: Call contract
      if (data.function && data.function !== '') {
        setLoadingStep(`⛓️ Calling ${data.function}...`);
        
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
      } else {
        setError('Could not determine which function to call');
      }
      
    } catch (err) {
      console.error('Error:', err);
      if (err.message.includes('could not detect network')) {
        setError('Cannot connect to blockchain. Check RPC URL');
      } else if (err.message.includes('function not found')) {
        setError(`Function not found in contract. Available: ${llmDecision?.available_functions?.join(', ')}`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const loadSample = () => {
    setContractAddress('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
    setRpcUrl('https://polygon-rpc.com');
    setAbi(sampleAbi);
    setQuery('');
    setError('');
  };

  return (
    <div className="App">
      <div className="container">
        <div className="header">
          <h1>🤖 Smart Contract Assistant</h1>
          <p>Powered by Local AI (Ollama + Llama 3.2)</p>
          <div className={`backend-status ${backendStatus}`}>
            {backendStatus === 'connected' ? '✅ Backend Connected' : '❌ Backend Not Running'}
          </div>
        </div>
        
        <div className="content">
          <button onClick={loadSample} className="sample-btn">
            📋 Load Sample (USDC on Polygon)
          </button>
          
          <div className="input-group">
            <label>📍 Contract Address</label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0x..."
              disabled={loading}
            />
          </div>
          
          <div className="input-group">
            <label>🔗 RPC URL (HTTP/HTTPS)</label>
            <input
              type="text"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="https://..."
              disabled={loading}
            />
          </div>
          
          <div className="input-group">
            <label>📄 Contract ABI</label>
            <textarea
              rows={6}
              value={abi}
              onChange={(e) => setAbi(e.target.value)}
              disabled={loading}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>
          
          <div className="input-group">
            <label>💬 Your Question</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., What is the name? or Total supply"
              disabled={loading}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          
          <button onClick={handleSubmit} disabled={loading || backendStatus !== 'connected'}>
            {loading ? `⏳ ${loadingStep}` : '🚀 Ask Contract'}
          </button>
          
          {error && (
            <div className="error-message">
              ❌ {error}
            </div>
          )}
          
          {llmDecision && llmDecision.function_name && (
            <div className="llm-decision">
              <h3>🧠 AI Decision</h3>
              <p><strong>Function:</strong> <code>{llmDecision.function_name}()</code></p>
              <p><strong>Parameters:</strong> <code>{JSON.stringify(llmDecision.parameters)}</code></p>
              <p><strong>Available:</strong> {llmDecision.available_functions?.join(', ')}</p>
            </div>
          )}
          
          {result && (
            <div className="result">
              <h3>✅ Result</h3>
              <div className="result-content">
                <pre>{result}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;