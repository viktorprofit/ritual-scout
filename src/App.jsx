import { useEffect, useState } from 'react'
import {
  BrowserProvider,
  Contract,
  keccak256,
  toUtf8Bytes,
} from 'ethers'

const RITUAL_CHAIN_ID = '0x7BB'

const REPORT_REGISTRY_ADDRESS =
  '0x2ce698e41f283E5d7B7923aFaaA7154459b5Db1B'

const REPORT_REGISTRY_ABI = [
  'function saveReport(string project, uint256 score, string model, string reportHash, string ipfsCid) external',
]

function App() {
  const [project, setProject] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const [wallet, setWallet] = useState('')
  const [walletError, setWalletError] = useState('')
  const [isRitualNetwork, setIsRitualNetwork] =
    useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [transactionHash, setTransactionHash] =
    useState('')

  const shortenAddress = (address) => {
    if (!address) return ''

    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatCurrency = (value) => {
    if (value === null || value === undefined) {
      return 'N/A'
    }

    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B`
    }

    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`
    }

    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(2)}K`
    }

    if (value >= 1) {
      return `$${value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })}`
    }

    return `$${value.toLocaleString(undefined, {
      maximumSignificantDigits: 6,
    })}`
  }

  const formatSupply = (value) => {
    if (value === null || value === undefined) {
      return 'N/A'
    }

    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`
    }

    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`
    }

    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(2)}K`
    }

    return value.toLocaleString()
  }

  const formatPercentage = (value) => {
    if (value === null || value === undefined) {
      return 'N/A'
    }

    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const checkNetwork = async () => {
    if (!window.ethereum) return

    try {
      const chainId = await window.ethereum.request({
        method: 'eth_chainId',
      })

      setIsRitualNetwork(
        chainId.toLowerCase() ===
          RITUAL_CHAIN_ID.toLowerCase(),
      )
    } catch (networkError) {
      console.error(
        'Failed to check network:',
        networkError,
      )

      setIsRitualNetwork(false)
    }
  }

  const switchToRitual = async () => {
    if (!window.ethereum) {
      setWalletError('MetaMask is not installed')
      return
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [
          {
            chainId: RITUAL_CHAIN_ID,
          },
        ],
      })

      setIsRitualNetwork(true)
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: RITUAL_CHAIN_ID,
                chainName: 'Ritual Network',
                nativeCurrency: {
                  name: 'RITUAL',
                  symbol: 'RITUAL',
                  decimals: 18,
                },
                rpcUrls: [
                  'https://rpc.ritualfoundation.org',
                ],
                blockExplorerUrls: [
                  'https://explorer.ritualfoundation.org',
                ],
              },
            ],
          })

          setIsRitualNetwork(true)
        } catch (addError) {
          console.error(
            'Failed to add Ritual Network:',
            addError,
          )

          setWalletError(
            'Failed to add Ritual Network',
          )
        }
      } else {
        console.error(
          'Failed to switch network:',
          switchError,
        )

        setWalletError(
          'Failed to switch to Ritual Network',
        )
      }
    }
  }

  const connectWallet = async () => {
    setWalletError('')

    if (!window.ethereum) {
      setWalletError('MetaMask is not installed')
      return
    }

    try {
      const accounts =
        await window.ethereum.request({
          method: 'eth_requestAccounts',
        })

      if (accounts.length > 0) {
        setWallet(accounts[0])
        await switchToRitual()
      }
    } catch (connectionError) {
      console.error(
        'Wallet connection failed:',
        connectionError,
      )

      setWalletError(
        'Wallet connection was cancelled',
      )
    }
  }

  const analyzeProject = async () => {
    const projectName = project.trim()

    if (!projectName) {
      setError('Enter a project name')
      return
    }

    setLoading(true)
    setResult(null)
    setError('')

    try {
      const response = await fetch(
        'http://localhost:3001/analyze',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project: projectName,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'AI analysis failed',
        )
      }

      setResult(data)
    } catch (requestError) {
      console.error(
        'Analysis failed:',
        requestError,
      )

      setError(
        requestError.message ||
          'Could not complete the analysis.',
      )
    } finally {
      setLoading(false)
    }
  }

  const saveReportOnChain = async () => {
    setSaveStatus('')
    setTransactionHash('')

    if (!window.ethereum) {
      setSaveStatus('MetaMask is not installed')
      return
    }

    if (!wallet) {
      setSaveStatus('Connect your wallet first')
      return
    }

    if (!isRitualNetwork) {
      setSaveStatus('Switch to Ritual Network first')
      return
    }

    if (!result) {
      setSaveStatus('Generate a report first')
      return
    }

    try {
      setSavingReport(true)
      setSaveStatus(
        'Confirm the transaction in MetaMask...',
      )

      const provider = new BrowserProvider(
        window.ethereum,
      )
      const signer = await provider.getSigner()

      const contract = new Contract(
        REPORT_REGISTRY_ADDRESS,
        REPORT_REGISTRY_ABI,
        signer,
      )

      const projectName =
        result.matchedProject?.name ||
        result.project ||
        project.trim()

      const reportData = {
        project: projectName,
        score: result.score,
        verdict: result.verdict,
        strengths: result.strengths,
        risks: result.risks,
        catalysts: result.catalysts,
        watchItems: result.watchItems,
        marketData: result.marketData,
        matchedProject: result.matchedProject,
      }

      const reportHash = keccak256(
        toUtf8Bytes(JSON.stringify(reportData)),
      )

      const score = Math.round(Number(result.score))

      if (!Number.isFinite(score)) {
        throw new Error('Invalid report score')
      }

      const transaction = await contract.saveReport(
        projectName,
        score,
        result.model || 'OpenAI',
        reportHash,
        '',
      )

      setSaveStatus(
        'Transaction submitted. Waiting for confirmation...',
      )

      const receipt = await transaction.wait()

      setTransactionHash(
        receipt?.hash || transaction.hash,
      )
      setSaveStatus(
        'Report successfully saved on-chain',
      )
    } catch (saveError) {
      console.error(
        'Failed to save report on-chain:',
        saveError,
      )

      if (
        saveError.code === 4001 ||
        saveError.code === 'ACTION_REJECTED'
      ) {
        setSaveStatus('Transaction was cancelled')
      } else {
        setSaveStatus(
          saveError.shortMessage ||
            saveError.reason ||
            saveError.message ||
            'Failed to save report on-chain',
        )
      }
    } finally {
      setSavingReport(false)
    }
  }

  useEffect(() => {
    if (!window.ethereum) return

    const restoreWallet = async () => {
      try {
        const accounts =
          await window.ethereum.request({
            method: 'eth_accounts',
          })

        if (accounts.length > 0) {
          setWallet(accounts[0])
        }

        await checkNetwork()
      } catch (restoreError) {
        console.error(
          'Failed to restore wallet:',
          restoreError,
        )
      }
    }

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setWallet('')
        return
      }

      setWallet(accounts[0])
    }

    const handleChainChanged = (chainId) => {
      setIsRitualNetwork(
        chainId.toLowerCase() ===
          RITUAL_CHAIN_ID.toLowerCase(),
      )
    }

    restoreWallet()

    window.ethereum.on(
      'accountsChanged',
      handleAccountsChanged,
    )

    window.ethereum.on(
      'chainChanged',
      handleChainChanged,
    )

    return () => {
      window.ethereum.removeListener(
        'accountsChanged',
        handleAccountsChanged,
      )

      window.ethereum.removeListener(
        'chainChanged',
        handleChainChanged,
      )
    }
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="flex items-center justify-between border-b border-zinc-800 px-6 py-5 md:px-10">
        <div>
          <h1 className="text-2xl font-bold text-violet-400">
            Ritual Scout
          </h1>

          {wallet && isRitualNetwork && (
            <p className="mt-1 text-xs text-emerald-400">
              ● Ritual Network
            </p>
          )}

          {wallet && !isRitualNetwork && (
            <button
              type="button"
              onClick={switchToRitual}
              className="mt-1 text-xs text-amber-400 hover:text-amber-300"
            >
              Switch to Ritual Network
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={connectWallet}
          className="rounded-xl bg-violet-600 px-5 py-3 font-medium transition hover:bg-violet-500"
        >
          {wallet
            ? shortenAddress(wallet)
            : 'Connect Wallet'}
        </button>
      </nav>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-20 md:pt-24">
        <div className="text-center">
          <div className="mb-6 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300">
            Powered by Ritual
          </div>

          <h2 className="text-4xl font-bold leading-tight md:text-6xl">
            AI-powered
            <br />
            Crypto Research
          </h2>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-zinc-400">
            Analyze any crypto project and receive a live
            market snapshot and AI-generated research report.
          </p>

          <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={project}
              onChange={(event) =>
                setProject(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !loading
                ) {
                  analyzeProject()
                }
              }}
              disabled={loading}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-4 text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-500 disabled:opacity-60 sm:flex-1"
              placeholder="Enter a project..."
            />

            <button
              type="button"
              onClick={analyzeProject}
              disabled={loading}
              className="rounded-xl bg-violet-600 px-8 py-4 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>

          {walletError && (
            <p className="mt-4 text-sm text-red-400">
              {walletError}
            </p>
          )}

          {error && (
            <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-left text-red-300">
              {error}
            </div>
          )}
        </div>

        {loading && (
          <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-violet-500" />

            <p className="mt-5 text-violet-400">
              Running AI analysis...
            </p>

            <p className="mt-2 text-sm text-zinc-500">
              Collecting live market data for{' '}
              {project.trim()}
            </p>
          </div>
        )}

        {result && (
          <section className="mt-12 space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {result.matchedProject?.image && (
                    <img
                      src={result.matchedProject.image}
                      alt={
                        result.matchedProject.name ||
                        result.project
                      }
                      className="h-14 w-14 rounded-full"
                    />
                  )}

                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-bold">
                        {result.matchedProject?.name ||
                          result.project}
                      </h3>

                      {result.matchedProject?.symbol && (
                        <span className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-400">
                          {
                            result.matchedProject
                              .symbol
                          }
                        </span>
                      )}
                    </div>

                    {result.matchedProject
                      ?.marketCapRank && (
                      <p className="mt-2 text-sm text-zinc-500">
                        Market Cap Rank #
                        {
                          result.matchedProject
                            .marketCapRank
                        }
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm uppercase tracking-widest text-zinc-500">
                    Signal Score
                  </p>

                  <p className="mt-1 text-4xl font-bold text-violet-400">
                    {result.score}/100
                  </p>
                </div>
              </div>
            </div>

            {result.marketData && (
              <div>
                <h3 className="mb-4 text-xl font-semibold">
                  Market Snapshot
                </h3>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="Price"
                    value={formatCurrency(
                      result.marketData.price,
                    )}
                  />

                  <MetricCard
                    label="Market Cap"
                    value={formatCurrency(
                      result.marketData.marketCap,
                    )}
                  />

                  <MetricCard
                    label="24h Volume"
                    value={formatCurrency(
                      result.marketData.volume24h,
                    )}
                  />

                  <MetricCard
                    label="24h Change"
                    value={formatPercentage(
                      result.marketData
                        .priceChange24h,
                    )}
                    valueClassName={
                      result.marketData
                        .priceChange24h >= 0
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }
                  />

                  <MetricCard
                    label="Circulating Supply"
                    value={formatSupply(
                      result.marketData
                        .circulatingSupply,
                    )}
                  />

                  <MetricCard
                    label="Total Supply"
                    value={formatSupply(
                      result.marketData.totalSupply,
                    )}
                  />

                  <MetricCard
                    label="All-Time High"
                    value={formatCurrency(
                      result.marketData.ath,
                    )}
                  />

                  <MetricCard
                    label="From ATH"
                    value={formatPercentage(
                      result.marketData
                        .athChangePercentage,
                    )}
                    valueClassName="text-amber-400"
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
              <div className="w-fit rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300">
                AI Analysis Complete
              </div>

              <div className="mt-8">
                <h3 className="text-xl font-semibold">
                  AI Verdict
                </h3>

                <p className="mt-4 leading-8 text-zinc-400">
                  {result.verdict}
                </p>
              </div>

              <div className="mt-10 grid gap-10 md:grid-cols-2">
                <ReportList
                  title="Strengths"
                  items={result.strengths}
                  titleClassName="text-emerald-400"
                  marker="+"
                />

                <ReportList
                  title="Risks"
                  items={result.risks}
                  titleClassName="text-amber-400"
                  marker="•"
                />

                <ReportList
                  title="Potential Catalysts"
                  items={result.catalysts}
                  titleClassName="text-violet-400"
                  marker="↗"
                />

                <ReportList
                  title="What to Watch"
                  items={result.watchItems}
                  titleClassName="text-sky-400"
                  marker="→"
                />
              </div>

              <div className="mt-10 border-t border-zinc-800 pt-6">
                <button
                  type="button"
                  onClick={saveReportOnChain}
                  disabled={
                    !wallet ||
                    !isRitualNetwork ||
                    savingReport
                  }
                  className="w-full rounded-xl border border-violet-500/40 bg-violet-500/10 px-5 py-3 font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {savingReport
                    ? 'Saving report on-chain...'
                    : wallet && isRitualNetwork
                      ? 'Save report on-chain'
                      : 'Connect to Ritual to save report'}
                </button>

                {saveStatus && (
                  <p className="mt-4 text-center text-sm text-zinc-400">
                    {saveStatus}
                  </p>
                )}

                {transactionHash && (
                  <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                    <p className="text-sm text-emerald-400">
                      Transaction confirmed
                    </p>

                    <p className="mt-1 break-all text-xs text-zinc-500">
                      {transactionHash}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function MetricCard({
  label,
  value,
  valueClassName = 'text-white',
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-3 text-xl font-semibold ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  )
}

function ReportList({
  title,
  items,
  titleClassName,
  marker,
}) {
  return (
    <div>
      <h4
        className={`text-lg font-semibold ${titleClassName}`}
      >
        {title}
      </h4>

      <div className="mt-4 space-y-4">
        {Array.isArray(items) &&
          items.map((item, index) => (
            <p
              key={`${title}-${index}`}
              className="leading-7 text-zinc-400"
            >
              {marker} {item}
            </p>
          ))}
      </div>
    </div>
  )
}

export default App