'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2, Send, CheckCircle, AlertCircle, Bot, Database, FileText, Search } from "lucide-react"
import { A2AVisualization } from "@/components/A2AVisualization"
import { AgentDiscovery } from "@/components/AgentDiscovery"
import { AgentCommunicationTest } from "@/components/AgentCommunicationTest"

const formSchema = z.object({
  prompt: z.string().min(1, "Enter a prompt"),
  context: z.string().optional(),
  audienceType: z.enum(['technical', 'executive', 'general']).optional(),
})

type FormData = z.infer<typeof formSchema>

interface ApiResponse {
  status: string
  type: string
  result: {
    workflow?: string
    steps?: {
      processing: string | object
      summary: string | object
    }
    final_result?: object
  } | string | object
  metadata: {
    completedAt: string
    gateway: string
    traceId?: string
    workflowExecutionId?: string
  }
}

export default function HomePage() {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'demo' | 'discovery' | 'communication'>('demo')
  const [taskProgress, setTaskProgress] = useState<{progress: number, phase: string} | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [resolvedTaskType, setResolvedTaskType] = useState<ApiResponse['type'] | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: '',
      context: '',
      audienceType: 'general',
    },
  })

  const pollTaskStatus = async (taskId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/gateway/task/${taskId}`);
        if (res.ok) {
          const taskData = await res.json();
          console.log('📊 Polling taskData received:', taskData);
          
          // Handle the newer A2A response format.
          let status, progress, currentPhase, result;
          
          if (taskData.task) {
            // Newer A2A format.
            status = taskData.task.status?.state;
            
            // Extract progress metadata from artifacts.
            const workflowArtifact = taskData.task.artifacts?.find((artifact: { type: string; metadata?: { progress?: number; currentPhase?: string }; data?: unknown }) => artifact.type === 'workflow-result');
            if (workflowArtifact?.metadata) {
              progress = workflowArtifact.metadata.progress;
              currentPhase = workflowArtifact.metadata.currentPhase;
            }
            result = workflowArtifact?.data;
          } else {
            // Fallback to the legacy format.
            status = taskData.status;
            progress = taskData.progress;
            currentPhase = taskData.currentPhase;
            result = taskData.result;
          }
          
          console.log('📊 Extracted status:', status, 'progress:', progress, 'phase:', currentPhase);
          
          // Update progress while supporting both payload formats.
          if (progress !== undefined || currentPhase !== undefined) {
            setTaskProgress({
              progress: progress !== undefined ? progress : (taskProgress?.progress || 0),
              phase: currentPhase || taskProgress?.phase || 'search'
            });
          } else if (status === 'working' && taskData.task?.status?.message?.parts?.[0]?.text) {
            // Extract progress information from the status message as a fallback.
            const messageText = taskData.task.status.message.parts[0].text;
            const progressMatch = messageText.match(/(\d+)%/);
            
            const phaseMatch = messageText.match(/(search|analyze|synthesize)/);
            
            if (progressMatch || phaseMatch) {
              const mappedPhase = phaseMatch ? phaseMatch[1] : (taskProgress?.phase || 'search');
              
              setTaskProgress({
                progress: progressMatch ? parseInt(progressMatch[1]) : (taskProgress?.progress || 0),
                phase: mappedPhase
              });
            }
          }

          if (status === 'completed') {
            console.log('✅ Task completed - updating response and stopping polling');
            // Normalize the completed payload into the existing ApiResponse shape.
            setResolvedTaskType('deep-research')
            setResponse({
              status: 'success',
              type: 'deep-research',
              result: result,
              metadata: {
                completedAt: new Date().toISOString(),
                gateway: 'gateway-agent',
                traceId: taskData.task?.id || taskId,
                workflowExecutionId: taskData.task?.id || taskId,
              }
            });
            setLoading(false);
            setTaskProgress(null);
            setCurrentTaskId(null);
            return;
          } else if (status === 'failed') {
            setError(`Deep Research failed: ${taskData.task?.status?.message?.parts?.[0]?.text || 'Unknown error'}`);
            setLoading(false);
            setTaskProgress(null);
            setCurrentTaskId(null);
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          setError('Deep Research timed out. The task may still be running.');
          setLoading(false);
          setTaskProgress(null);
          setCurrentTaskId(null);
        }
      } catch (error) {
        console.error('Polling error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          setError('Failed to poll task status');
          setLoading(false);
          setTaskProgress(null);
          setCurrentTaskId(null);
        }
      }
    };

    // Start polling after a short initial delay.
    setTimeout(poll, 5000);
  };

  const onSubmit = async (values: FormData) => {
    setLoading(true)
    setError(null)
    setResponse(null)
    setTaskProgress(null)
    setCurrentTaskId(null)
    setResolvedTaskType(null)
    let asyncAccepted = false

    try {
      const requestBody = {
        prompt: values.prompt,
        context: values.context ? { description: values.context } : undefined,
        audienceType: values.audienceType,
      };

      // Apply a request timeout.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120000)

      const res = await fetch('/api/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || `HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      
      if (data.taskId) {
        asyncAccepted = true
        setResolvedTaskType(data.type || 'deep-research')
        setCurrentTaskId(data.taskId)
        setTaskProgress({
          progress: 0,
          phase: 'initiation',
        })
        pollTaskStatus(data.taskId)
      } else {
        setResolvedTaskType(data.type)
        setResponse(data)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('The request timed out. Processing is taking longer than expected.')
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    } finally {
      if (!asyncAccepted) {
        setLoading(false)
      }
    }
  }

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'process':
        return <Database className="h-4 w-4" />
      case 'summarize':
        return <FileText className="h-4 w-4" />
      case 'analyze':
        return <Bot className="h-4 w-4" />
      case 'web-search':
      case 'news-search':
      case 'scholarly-search':
        return <Search className="h-4 w-4" />
      case 'deep-research':
        return <Bot className="h-4 w-4" />
      default:
        return <Bot className="h-4 w-4" />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-slate-900">
            Mastra A2A Demo
          </h1>
          <p className="text-slate-600">
            Multi-agent communication demo built on the Agent-to-Agent protocol
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Bot className="h-3 w-3" />
              Gateway Agent
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              Data Processor
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Summarizer
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Search className="h-3 w-3" />
              Web Search
            </Badge>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex space-x-1 rounded-lg bg-gray-100 p-1">
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'demo'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('demo')}
            >
              Demo
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'discovery'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('discovery')}
            >
              Agent Discovery
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'communication'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('communication')}
            >
              Communication Test
            </button>
          </div>
        </div>

        {activeTab === 'demo' && (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5" />
                        Submit Request
                      </CardTitle>
                      <CardDescription>
                        Enter a prompt. The gateway agent will classify intent and route it to the right agent or workflow.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                          <FormField
                            control={form.control}
                            name="prompt"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Prompt</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Example: Analyze this quarterly sales JSON and summarize the key trends for executives."
                                    className="min-h-[140px]"
                                    {...field}
                                  />
                                </FormControl>
                                <FormDescription>
                                  The gateway agent decides whether to process data, summarize content, search the web, or start deep research.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="context"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Context (Optional)</FormLabel>
                                <FormControl>
                                  <Input placeholder="Example: Sales data for Q1 2024" {...field} />
                                </FormControl>
                                <FormDescription>
                                  Add background information or a short description of the data
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="audienceType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Audience</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select an audience" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="general">General</SelectItem>
                                    <SelectItem value="technical">Technical</SelectItem>
                                    <SelectItem value="executive">Executive</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Controls how the result is framed
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <Button type="submit" className="w-full" disabled={loading || Boolean(currentTaskId)}>
                            {loading || Boolean(currentTaskId) ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {resolvedTaskType === 'deep-research' && currentTaskId
                                  ? 'Running Deep Research...'
                                  : resolvedTaskType
                                    ? 'Processing...'
                                    : 'Routing Request...'}
                              </>
                            ) : (
                              <>
                                <Send className="mr-2 h-4 w-4" />
                                Submit
                              </>
                            )}
                          </Button>
                        </form>
                      </Form>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Result
                      </CardTitle>
                      <CardDescription>
                        Agent responses will appear here
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {error && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      )}

                      {response && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="flex items-center gap-1">
                              {getTaskIcon(response.type)}
                              {response.type === 'deep-research' ? 'Deep Research' : response.type}
                            </Badge>
                            <Badge variant="secondary">{response.status}</Badge>
                          </div>

                          <div className="rounded-md bg-slate-50 p-4">
                            <h4 className="mb-2 font-semibold">
                              {response.type === 'deep-research' ? 'Deep Research Result:' : 'Result:'}
                            </h4>
                            {response.type === 'deep-research' && typeof response.result === 'object' ? (
                              <div className="space-y-3">
                                <div>
                                  <h5 className="font-medium text-slate-700">Executive Summary:</h5>
                                  <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                                    {(response.result as Record<string, unknown>)?.executiveSummary as string || 'No summary was generated'}
                                  </pre>
                                </div>
                                {Array.isArray((response.result as Record<string, unknown>)?.keyFindings) && (
                                  <div>
                                    <h5 className="font-medium text-slate-700">Key Findings:</h5>
                                    <div className="mt-1 text-sm text-slate-600">
                                      {((response.result as Record<string, unknown>).keyFindings as string[]).map((finding: string, index: number) => (
                                        <div key={index} className="py-1">• {finding}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {Array.isArray((response.result as Record<string, unknown>)?.recommendations) && (
                                  <div>
                                    <h5 className="font-medium text-slate-700">Recommendations:</h5>
                                    <div className="mt-1 text-sm text-slate-600">
                                      {((response.result as Record<string, unknown>).recommendations as string[]).map((rec: string, index: number) => (
                                        <div key={index} className="py-1">• {rec}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {typeof (response.result as Record<string, unknown>)?.fullReport === 'string' && (
                                  <div>
                                    <h5 className="font-medium text-slate-700">Detailed Report:</h5>
                                    <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-600 max-h-60 overflow-y-auto">
                                      {(response.result as Record<string, unknown>).fullReport as string}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ) : response.type === 'analyze' && typeof response.result === 'object' && response.result && 'workflow' in response.result ? (
                              <div className="space-y-3">
                                <div>
                                  <h5 className="font-medium text-slate-700">Processing Result:</h5>
                                  <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                                    {response.result.steps && typeof response.result.steps.processing === 'string'
                                      ? response.result.steps.processing
                                      : JSON.stringify(response.result.steps?.processing || '', null, 2)
                                    }
                                  </pre>
                                </div>
                                <div>
                                  <h5 className="font-medium text-slate-700">Summary Result:</h5>
                                  <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                                    {response.result.steps && typeof response.result.steps.summary === 'string'
                                      ? response.result.steps.summary
                                      : JSON.stringify(response.result.steps?.summary || '', null, 2)
                                    }
                                  </pre>
                                </div>
                              </div>
                            ) : response.type.includes('search') && typeof response.result === 'object' && response.result && 'result' in response.result ? (
                              <div className="space-y-3">
                                <div>
                                  <h5 className="font-medium text-slate-700">Search Query:</h5>
                                  <p className="mt-1 text-sm text-slate-600">{(response.result as { result?: { query?: string } }).result?.query || 'N/A'}</p>
                                </div>
                                <div>
                                  <h5 className="font-medium text-slate-700">Search Summary:</h5>
                                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                                    {(response.result as { result?: { summary?: string } }).result?.summary || 'N/A'}
                                  </div>
                                </div>
                                {(response.result as { result?: { results?: Array<{ title: string; url: string; snippet: string; source?: string }> } }).result?.results && (
                                  <div>
                                    <h5 className="font-medium text-slate-700">Results ({(response.result as { result: { results: Array<unknown> } }).result.results.length}):</h5>
                                    <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                                      {(response.result as { result: { results: Array<{ title: string; url: string; snippet: string; source?: string }> } }).result.results.slice(0, 5).map((item, index: number) => (
                                        <div key={index} className="border-l-2 border-blue-200 pl-3">
                                          <h6 className="font-medium text-blue-900 text-sm">{item.title}</h6>
                                          <p className="text-xs text-slate-600 mt-1">{item.snippet}</p>
                                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                                            {item.source || item.url}
                                          </a>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <pre className="whitespace-pre-wrap text-sm text-slate-600">
                                {typeof response.result === 'string'
                                  ? response.result
                                  : JSON.stringify(response.result, null, 2)
                                }
                              </pre>
                            )}
                          </div>

                          <div className="text-xs text-slate-500">
                            <p>Completed At: {new Date(response.metadata.completedAt).toLocaleString('en-GB')}</p>
                            <p>Handling Agent: {response.metadata.gateway}</p>
                          </div>
                        </div>
                      )}

                      {!response && !error && !loading && !currentTaskId && (
                        <div className="flex h-32 items-center justify-center text-slate-500">
                          <p>Results will appear here after you submit a request</p>
                        </div>
                      )}

                      {(loading || currentTaskId) && (
                        <div className="flex h-32 items-center justify-center">
                          <div className="text-center">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
                            <p className="mt-2 text-slate-500">
                              {taskProgress && currentTaskId ? (
                                <>
                                  Running Deep Research... ({taskProgress.progress}%)
                                  <br />
                                  <span className="text-xs text-slate-400">
                                    Phase: {taskProgress.phase === 'search' ? 'Web Search' :
                                            taskProgress.phase === 'analyze' ? 'Data Analysis' :
                                            taskProgress.phase === 'synthesize' ? 'Synthesis' : taskProgress.phase}
                                  </span>
                                </>
                              ) : currentTaskId ? (
                                'Starting Deep Research...'
                              ) : (
                                resolvedTaskType
                                  ? `Processing with ${resolvedTaskType}...`
                                  : 'Routing through the gateway agent...'
                              )}
                            </p>
                            {taskProgress && (
                              <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                  style={{ width: `${taskProgress.progress}%` }}
                                ></div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="lg:col-span-1">
                <A2AVisualization
                  isActive={loading || Boolean(currentTaskId)}
                  taskType={(loading || Boolean(currentTaskId))
                    ? (resolvedTaskType as 'process' | 'summarize' | 'analyze' | 'web-search' | 'news-search' | 'scholarly-search' | 'deep-research' | null)
                    : (response ? response.type as 'process' | 'summarize' | 'analyze' | 'web-search' | 'news-search' | 'scholarly-search' | 'deep-research' : null)}
                  workflowExecutionId={response?.metadata?.workflowExecutionId}
                  taskId={currentTaskId || undefined}
                  taskProgress={taskProgress}
                />
              </div>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Sample Prompts</CardTitle>
                <CardDescription>
                  Use these prompts to exercise different routing decisions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <div className="rounded-md bg-slate-50 p-3">
                    <h4 className="mb-2 font-medium">Data Processing</h4>
                    <pre className="text-xs text-slate-600">
{`Clean and process this JSON:
{
  "sales": [100, 150, 200, 175, 250],
  "products": ["A", "B", "C", "D", "E"],
  "quarter": "Q1 2024"
}`}
                    </pre>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <h4 className="mb-2 font-medium">Summarization</h4>
                    <pre className="text-xs text-slate-600">
{`Summarize this incident update for an executive audience:
API latency increased 18%, cache hit rate dropped from 92% to 81%, and database CPU peaked at 87%.`}
                    </pre>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <h4 className="mb-2 font-medium">Analysis</h4>
                    <pre className="text-xs text-slate-600">
{`Analyze this support data and summarize the main trends:
{
  "support": [
    {"week": "W1", "resolved": 84, "opened": 91},
    {"week": "W2", "resolved": 95, "opened": 88},
    {"week": "W3", "resolved": 103, "opened": 90}
  ]
}`}
                    </pre>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <h4 className="mb-2 font-medium">Search And Research</h4>
                    <pre className="text-xs text-slate-600">
{`Find recent news about Anthropic enterprise announcements.

Research AI agents in enterprise support and produce a detailed report with sources.`}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'discovery' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <AgentDiscovery />
            <Card>
              <CardHeader>
                <CardTitle>A2A Protocol Information</CardTitle>
                <CardDescription>
                  Implemented A2A capabilities
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Agent card lookup (`getAgentCard`)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Message sending (`sendMessage`)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Task status lookup (`getTask`)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Task cancellation (`cancelTask`)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Agent discovery</span>
                  </div>
                </div>
                
                <div className="p-3 bg-blue-50 rounded-md">
                  <h4 className="font-medium text-blue-900 mb-2">Standard Endpoints</h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <div><code>/api/gateway/info</code> - Gateway information</div>
                    <div><code>/api/gateway/message</code> - Messaging</div>
                    <div><code>/api/gateway/task</code> - Task management</div>
                    <div><code>/api/gateway/agents</code> - Agent directory</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'communication' && (
          <AgentCommunicationTest />
        )}
      </div>
    </div>
  )
}
