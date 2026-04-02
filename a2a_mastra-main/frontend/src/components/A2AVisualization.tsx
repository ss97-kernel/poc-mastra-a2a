'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bot, Database, FileText, Search, ArrowDown, Loader2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
// import { WorkflowExecution, WorkflowStep } from "@shared/types"

// Define these types locally for now.
interface WorkflowStep {
  id: string;
  stepNumber: number;
  agentId: string;
  agentName: string;
  operation: string;
  input: unknown;
  output?: unknown;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  error?: string;
  traceId?: string;
}

interface WorkflowExecution {
  id: string;
  requestId: string;
  type: 'process' | 'summarize' | 'analyze';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial';
  steps: WorkflowStep[];
  metadata: {
    initiatedBy: string;
    startedAt: string;
    completedAt?: string;
    totalDuration?: number;
    dataSize?: number;
    audienceType?: string;
  };
  result?: unknown;
  error?: string;
  langfuseTraceId?: string;
}

interface A2AStep {
  id: string
  agent: 'gateway' | 'data-processor' | 'summarizer' | 'web-search'
  action: 'routing' | 'processing' | 'summarizing' | 'searching' | 'responding'
  status: 'pending' | 'active' | 'completed'
  message: string
  timestamp: number
  details?: {
    request?: unknown
    response?: unknown
    endpoint?: string
    method?: string
    duration?: number
  }
}

interface A2AVisualizationProps {
  isActive: boolean
  taskType: 'process' | 'summarize' | 'analyze' | 'web-search' | 'news-search' | 'scholarly-search' | 'deep-research' | null
  workflowExecutionId?: string
  taskId?: string
  taskProgress?: {progress: number, phase: string} | null
  onStepUpdate?: (step: A2AStep) => void
}

export function A2AVisualization({ isActive, taskType, workflowExecutionId, taskId, taskProgress, onStepUpdate }: A2AVisualizationProps) {
  const [steps, setSteps] = useState<A2AStep[]>([])
  const [selectedStep, setSelectedStep] = useState<A2AStep | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [realWorkflowData, setRealWorkflowData] = useState<WorkflowExecution | null>(null)
  const [taskData, setTaskData] = useState<Record<string, unknown> | null>(null)

  // Fetch task data for Deep Research.
  const fetchTaskData = async (taskId: string) => {
    console.log('🔍 Fetching Deep Research task data for task ID:', taskId)
    try {
      const response = await fetch(`/api/gateway/task/${taskId}`)
      console.log('📡 Task API response status:', response.status)
      if (response.ok) {
        const taskData = await response.json()
        console.log('✅ Task data received:', taskData)
        
        // Handle the newer A2A response format.
        if (taskData.task) {
          // Extract progress and phase information.
          let extractedProgress, extractedPhase;
          
          // Extract progress information from artifacts.
          const workflowArtifact = taskData.task.artifacts?.find((artifact: {type: string, metadata?: {progress?: number, currentPhase?: string}}) => artifact.type === 'workflow-result');
          if (workflowArtifact?.metadata) {
            extractedProgress = workflowArtifact.metadata.progress;
            extractedPhase = workflowArtifact.metadata.currentPhase;
          }
          
          // Extract progress information from the message as a fallback.
          if ((extractedProgress === undefined || extractedPhase === undefined) && taskData.task.status?.message?.parts?.[0]?.text) {
            const messageText = taskData.task.status.message.parts[0].text;
            const progressMatch = messageText.match(/(\d+)%/);
            
            const phaseMatch = messageText.match(/(search|analyze|synthesize)/);
            
            if (progressMatch && extractedProgress === undefined) {
              extractedProgress = parseInt(progressMatch[1]);
            }
            if (phaseMatch && extractedPhase === undefined) {
              extractedPhase = phaseMatch[1];
            }
          }
          
          const processedTaskData = {
            id: taskData.task.id,
            status: {
              state: taskData.task.status.state,
              timestamp: taskData.task.status.timestamp,
              message: taskData.task.status.message?.parts?.[0]?.text || 'Processing...'
            },
            artifacts: taskData.task.artifacts || [],
            // Extract result data.
            result: taskData.task.artifacts && taskData.task.artifacts.length > 0 ? 
              taskData.task.artifacts.find((artifact: {type: string, data?: unknown}) => artifact.type === 'workflow-result')?.data :
              null,
            // Extract progress data.
            progress: extractedProgress,
            currentPhase: extractedPhase
          }
          
          console.log('📊 Processed task data:', processedTaskData)
          console.log('🔍 Debug - status.state:', processedTaskData.status.state)
          console.log('🔍 Debug - progress:', processedTaskData.progress)
          console.log('🔍 Debug - currentPhase:', processedTaskData.currentPhase)
          setTaskData(processedTaskData)
          return processedTaskData
        } else {
          // Fallback for the legacy response format.
          setTaskData(taskData)
          return taskData
        }
      } else {
        console.log('❌ Task API returned error status:', response.status)
      }
    } catch (error) {
      console.error('❌ Failed to fetch task data:', error)
    }
    return null
  }

  // Fetch real workflow execution data.
  const fetchWorkflowData = async (executionId: string) => {
    console.log('🔍 Fetching workflow data for execution ID:', executionId)
    try {
      const response = await fetch(`http://localhost:3001/api/workflows/${executionId}`)
      console.log('📡 Workflow API response status:', response.status)
      if (response.ok) {
        const workflowData: WorkflowExecution = await response.json()
        console.log('✅ Workflow data received:', workflowData)
        console.log('📊 Number of steps:', workflowData.steps.length)
        setRealWorkflowData(workflowData)
        return workflowData
      } else {
        console.log('❌ Workflow API returned error status:', response.status)
      }
    } catch (error) {
      console.error('❌ Failed to fetch workflow data:', error)
    }
    return null
  }

  // Convert a WorkflowStep into an A2AStep.
  const convertWorkflowStepToA2AStep = (workflowStep: WorkflowStep): A2AStep => {
    // Map the agent name to the A2AStep agent type.
    const getAgentType = (agentName: string): 'gateway' | 'data-processor' | 'summarizer' | 'web-search' => {
      if (agentName.includes('gateway')) return 'gateway'
      if (agentName.includes('data-processor')) return 'data-processor'
      if (agentName.includes('summarizer')) return 'summarizer'
      if (agentName.includes('web-search')) return 'web-search'
      return 'gateway'
    }

    // Map the workflow operation to the A2A action type.
    const getActionType = (operation: string): 'routing' | 'processing' | 'summarizing' | 'searching' | 'responding' => {
      if (operation.includes('routing') || operation.includes('route')) return 'routing'
      if (operation.includes('process') || operation.includes('analyzing')) return 'processing'
      if (operation.includes('summariz')) return 'summarizing'
      if (operation.includes('search')) return 'searching'
      return 'responding'
    }

    return {
      id: workflowStep.id,
      agent: getAgentType(workflowStep.agentName),
      action: getActionType(workflowStep.operation),
      status: workflowStep.status === 'in_progress' ? 'active' : 
              workflowStep.status === 'completed' ? 'completed' : 
              workflowStep.status === 'failed' ? 'completed' : 'pending',
      message: `${workflowStep.operation} - ${workflowStep.agentName}`,
      timestamp: new Date(workflowStep.startedAt).getTime(),
      details: {
        request: workflowStep.input,
        response: workflowStep.output,
        endpoint: '/api/gateway/message',
        method: 'POST',
        duration: workflowStep.duration || 0
      }
    }
  }

  const getAgentIcon = (agent: string) => {
    switch (agent) {
      case 'gateway':
        return <Bot className="h-4 w-4" />
      case 'data-processor':
        return <Database className="h-4 w-4" />
      case 'summarizer':
        return <FileText className="h-4 w-4" />
      case 'web-search':
        return <Search className="h-4 w-4" />
      default:
        return <Bot className="h-4 w-4" />
    }
  }

  const getAgentName = (agent: string) => {
    switch (agent) {
      case 'gateway':
        return 'Gateway Agent'
      case 'data-processor':
        return 'Data Processor'
      case 'summarizer':
        return 'Summarizer'
      case 'web-search':
        return 'Web Search Agent'
      default:
        return 'Unknown Agent'
    }
  }


  useEffect(() => {
    console.log('🚀 A2AVisualization useEffect triggered', { isActive, taskType, workflowExecutionId, taskId })
    
    // Deep Research uses a different visualization path.
    if (taskType === 'deep-research' && taskId) {
      console.log('🔬 Deep Research mode - using task polling visualization')
      
      // Build the Deep Research phase view.
      const generateDeepResearchSteps = (progress: number, phase: string, taskData?: Record<string, unknown>) => {
        const phases = ['search', 'analyze', 'synthesize']
        const phaseNames = {
          'search': 'Web Search Phase',
          'analyze': 'Data Analysis Phase',
          'synthesize': 'Synthesis Phase'
        }
        
        // Update progress and phase if the task has already completed.
        let actualProgress = progress
        let actualPhase = phase
        
        if (taskData && taskData.status) {
          const status = taskData.status as {state: string}
          if (status.state === 'completed') {
            actualProgress = 100
            actualPhase = 'completed'
          } else if (taskData.progress !== undefined) {
            actualProgress = taskData.progress as number
          }
          if (taskData.currentPhase) {
            actualPhase = taskData.currentPhase as string
          }
        }
        
        return phases.map((p, index) => {
          let status: 'pending' | 'active' | 'completed'
          // Determine status from phase and progress.
          if (actualPhase === 'completed' || actualProgress === 100) {
            status = 'completed'
          } else if (actualPhase === p) {
            status = 'active'
          } else {
            const phaseThresholds = [33, 66, 95]
            if (actualProgress > phaseThresholds[index]) {
              status = 'completed'
            } else if (actualProgress > (index > 0 ? phaseThresholds[index - 1] : 0)) {
              status = 'active'
            } else {
              status = 'pending'
            }
          }
          
          return {
            id: `deep-research-${p}`,
            agent: p === 'search' ? 'web-search' as const : 
                   p === 'analyze' ? 'data-processor' as const : 
                   'summarizer' as const,
            action: p === 'search' ? 'searching' as const :
                   p === 'analyze' ? 'processing' as const :
                   'summarizing' as const,
            status,
            message: `${phaseNames[p as keyof typeof phaseNames]} ${status === 'active' ? `(${actualProgress}%)` : status === 'completed' ? 'Complete' : 'Waiting'}`,
            timestamp: Date.now() - (3 - index) * 1000,
            details: taskData && status === 'completed' ? {
              request: `${p} phase request`,
              response: taskData.result ? JSON.stringify(taskData.result, null, 2) : `${p} completed`,
              method: 'POST',
              endpoint: '/api/gateway/task',
              duration: 2000
            } : undefined
          }
        })
      }
      
      // Determine progress from taskData or taskProgress.
      let currentProgress = taskProgress?.progress || 0
      let currentPhase = taskProgress?.phase || 'search'
      
      if (taskData && taskData.status) {
        const status = taskData.status as {state: string}
        if (status.state === 'completed') {
          currentProgress = 100
          currentPhase = 'completed'
        } else {
          if (taskData.progress !== undefined) {
            currentProgress = taskData.progress as number
          }
          if (taskData.currentPhase) {
            currentPhase = taskData.currentPhase as string
          }
        }
      }
      
      const steps = generateDeepResearchSteps(currentProgress, currentPhase, taskData || undefined)
      setSteps(steps)
      
      // Poll task data while the task is active.
      if (isActive) {
        const interval = setInterval(async () => {
          const data = await fetchTaskData(taskId)
          // Stop polling once the task completes.
          if (data && (
            (data.status && (data.status as {state: string}).state === 'completed') ||
            (data.progress !== undefined && data.progress === 100) ||
            (data.currentPhase === 'completed')
          )) {
            console.log('🛑 Task completed - stopping polling')
            clearInterval(interval)
            return true
          }
          return false
        }, 5000)
        
        return () => clearInterval(interval)
      }
      
      return
    }
    
    // Keep the view visible when workflowExecutionId exists, even after completion.
    if (!isActive && !workflowExecutionId) {
      console.log('❌ Early return: inactive and no workflowExecutionId')
      setSteps([])
      setRealWorkflowData(null)
      return
    }

    // Process real workflow data only when a workflowExecutionId exists.
    if (workflowExecutionId) {
      console.log('🔄 Fetching real workflow data')
      
      const loadWorkflowData = async () => {
        try {
          const workflowData = await fetchWorkflowData(workflowExecutionId)
          if (workflowData && workflowData.steps.length > 0) {
            console.log('✅ Converting real workflow steps to A2A steps')
            // Render the actual workflow steps.
            const realSteps = workflowData.steps.map(convertWorkflowStepToA2AStep)
            console.log('📋 Real steps converted:', realSteps)
            setSteps(realSteps)
            
            // Poll while the workflow is still running.
            if (workflowData.status === 'in_progress' || workflowData.status === 'pending') {
              console.log('⏳ Workflow in progress, will poll for updates')
              return true
            } else {
              console.log('✅ Workflow completed')
              return false
            }
          } else {
            console.log('⚠️ No workflow data or steps found')
            setSteps([])
            return false
          }
        } catch (error) {
          console.log('❌ Error fetching workflow data:', error)
          setSteps([])
          return false
        }
      }

      // Load the initial data.
      loadWorkflowData().then((shouldContinuePolling) => {
        if (shouldContinuePolling) {
          // Poll every 2 seconds while the workflow is running.
          const pollInterval = setInterval(async () => {
            const continuePolling = await loadWorkflowData()
            if (!continuePolling) {
              clearInterval(pollInterval)
            }
          }, 2000)

          // Return a cleanup function.
          return () => clearInterval(pollInterval)
        }
      })

    } else if (isActive && taskType) {
      console.log('📝 Showing loading state while waiting for workflowExecutionId')
      // Show a placeholder until workflowExecutionId is available.
      setSteps([{
        id: 'loading',
        agent: 'gateway',
        action: 'routing',
        status: 'active',
        message: 'Starting A2A communication...',
        timestamp: Date.now()
      }])
    } else {
      console.log('📝 No active task')
      setSteps([])
    }

  }, [isActive, taskType, workflowExecutionId, taskId, taskProgress, taskData, onStepUpdate])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />
      default:
        return <div className="h-3 w-3 rounded-full bg-gray-300" />
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-sm">
          {taskType === 'deep-research' ? 'Deep Research Progress' : 'A2A Communication Flow'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isActive && !taskId && (
          <div className="space-y-4">
            <div className="text-center text-sm text-muted-foreground py-4">
              {taskType === 'deep-research' ? 
                'Deep Research progress will appear here while the task is running.' :
                'The A2A communication flow will appear here while a task is running.'
              }
            </div>
          </div>
        )}
        
        {steps.map((step, index) => (
          <div key={step.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <button
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors hover:opacity-80",
                    step.status === 'active' && "bg-blue-50 text-blue-700",
                    step.status === 'completed' && "bg-green-50 text-green-700 cursor-pointer",
                    step.status === 'pending' && "bg-gray-50 text-gray-600"
                  )}
                  onClick={() => {
                    if (step.status === 'completed' && step.details) {
                      setSelectedStep(step)
                      setShowModal(true)
                    }
                  }}
                  disabled={step.status !== 'completed' || !step.details}
                >
                  {getAgentIcon(step.agent)}
                  <span className="font-medium">{getAgentName(step.agent)}</span>
                  {step.status === 'completed' && step.details && (
                    <span className="text-xs opacity-60">📄</span>
                  )}
                </button>
                {getStatusIcon(step.status)}
              </div>
            </div>
            
            <div className={cn(
              "text-xs pl-6 pr-2 py-1 rounded text-muted-foreground",
              step.status === 'active' && "text-blue-600 bg-blue-50",
              step.status === 'completed' && "text-green-600"
            )}>
              {step.message}
            </div>
            
            {index < steps.length - 1 && (
              <div className="flex justify-center">
                <ArrowDown className={cn(
                  "h-4 w-4 text-gray-300",
                  step.status === 'completed' && "text-green-400"
                )} />
              </div>
            )}
          </div>
        ))}
        
        {((isActive || realWorkflowData) && taskType && taskType !== 'deep-research') && (
          <div className="mt-4 space-y-3">
            {!realWorkflowData || realWorkflowData.status === 'in_progress' || realWorkflowData.status === 'pending' ? (
              <div className="p-3 bg-blue-50 rounded-md">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-medium">
                    {taskType === 'process' && 'Processing data...'}
                    {taskType === 'summarize' && 'Generating summary...'}
                    {taskType === 'analyze' && 'Running analysis workflow...'}
                    {taskType === 'web-search' && 'Running web search...'}
                    {taskType === 'news-search' && 'Running news search...'}
                    {taskType === 'scholarly-search' && 'Running scholarly search...'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-green-50 rounded-md">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">
                    {taskType === 'process' && 'Data processing complete'}
                    {taskType === 'summarize' && 'Summary complete'}
                    {taskType === 'analyze' && 'Analysis workflow complete'}
                    {taskType === 'web-search' && 'Web search complete'}
                    {taskType === 'news-search' && 'News search complete'}
                    {taskType === 'scholarly-search' && 'Scholarly search complete'}
                  </span>
                </div>
              </div>
            )}
            
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="text-xs text-gray-600 space-y-1">
                <div className="font-medium">View step details:</div>
                <div>Click any completed step in green.</div>
                <div>Inspect the request and response details.</div>
                <div>Review the A2A protocol traffic for that step.</div>
                {realWorkflowData && (
                  <div className="text-purple-600 font-medium">Showing real execution history data.</div>
                )}
                {!realWorkflowData && workflowExecutionId && (
                  <div className="text-orange-600">Attempting to load workflow data.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Deep Research progress view */}
        {taskType === 'deep-research' && (isActive || taskId) && (
          <div className="mt-4 space-y-3">
            {/* Determine progress from task data when available. */}
            {(() => {
              const actualProgress = taskData?.progress !== undefined ? taskData.progress as number : (taskProgress?.progress || 0)
              const actualPhase = taskData?.currentPhase || taskProgress?.phase || 'search'
              
              // Log debug information.
              console.log('🔍 Complete check - actualProgress:', actualProgress)
              console.log('🔍 Complete check - actualPhase:', actualPhase)
              console.log('🔍 Complete check - taskData:', taskData)
              console.log('🔍 Complete check - taskData.status:', taskData?.status)
              
              // Use multiple signals to determine whether the task has completed.
              const taskStatus = taskData?.status as {state: string} | undefined
              const statusCompleted = taskStatus?.state === 'completed'
              const progressCompleted = actualProgress === 100
              const phaseCompleted = actualPhase === 'completed'
              
              console.log('🔍 Complete check - taskStatus.state:', taskStatus?.state)
              console.log('🔍 Complete check - statusCompleted:', statusCompleted)
              console.log('🔍 Complete check - progressCompleted:', progressCompleted)
              console.log('🔍 Complete check - phaseCompleted:', phaseCompleted)
              
              const isCompleted = statusCompleted || progressCompleted || phaseCompleted
              console.log('🔍 Complete check - isCompleted:', isCompleted)
              
              if (isCompleted) {
                return (
                  <div className="p-3 bg-green-50 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-green-700 mb-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-medium">Deep Research complete (100%)</span>
                    </div>
                    <div className="text-xs text-green-600">
                      All research phases have completed.
                    </div>
                    <div className="w-full bg-green-200 rounded-full h-2 mt-2">
                      <div className="bg-green-600 h-2 rounded-full w-full"></div>
                    </div>
                  </div>
                )
              } else {
                return (
                  <div className="p-3 bg-blue-50 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-blue-700 mb-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="font-medium">Running Deep Research... ({actualProgress}%)</span>
                    </div>
                    <div className="text-xs text-blue-600">
                      Current phase: {actualPhase === 'search' ? 'Web Search' :
                                      actualPhase === 'analyze' ? 'Data Analysis' :
                                      actualPhase === 'synthesize' ? 'Synthesis' :
                                      actualPhase === 'completed' ? 'Completed' : String(actualPhase)}
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${actualProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )
              }
            })()}
            
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="text-xs text-gray-600 space-y-1">
                <div className="font-medium">Deep Research details:</div>
                <div>Multi-agent collaboration for long-running research.</div>
                <div>Three phases: Web Search, Data Analysis, and Synthesis.</div>
                <div>Real-time progress updates through async task polling.</div>
                {taskId && (
                  <div className="text-blue-600 font-medium">Task ID: {taskId}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Step Details Modal */}
      {showModal && selectedStep && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getAgentIcon(selectedStep.agent)}
                  <div>
                    <h3 className="text-lg font-semibold">{getAgentName(selectedStep.agent)}</h3>
                    <p className="text-sm text-gray-600">{selectedStep.message}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-6">
                {/* Request Details */}
                {selectedStep.details?.request !== undefined && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      Request
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {selectedStep.details.method} {selectedStep.details.endpoint}
                      </span>
                    </h4>
                    <pre className="bg-gray-50 p-4 rounded-md text-xs overflow-x-auto border">
                      {typeof selectedStep.details.request === 'string' 
                        ? selectedStep.details.request 
                        : JSON.stringify(selectedStep.details.request, null, 2)}
                    </pre>
                  </div>
                )}
                
                {/* Response Details */}
                {selectedStep.details?.response !== undefined && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      Response
                      {selectedStep.details.duration && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          {selectedStep.details.duration}ms
                        </span>
                      )}
                    </h4>
                    <pre className="bg-gray-50 p-4 rounded-md text-xs overflow-x-auto border">
                      {typeof selectedStep.details.response === 'string' 
                        ? selectedStep.details.response 
                        : JSON.stringify(selectedStep.details.response, null, 2)}
                    </pre>
                  </div>
                )}
                
                {/* Step Info */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Step Information</h4>
                  <div className="bg-blue-50 p-4 rounded-md">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-blue-700">Agent:</span>
                        <div>{getAgentName(selectedStep.agent)}</div>
                      </div>
                      <div>
                        <span className="font-medium text-blue-700">Action:</span>
                        <div>{selectedStep.action}</div>
                      </div>
                      <div>
                        <span className="font-medium text-blue-700">Status:</span>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(selectedStep.status)}
                          {selectedStep.status}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-blue-700">Time:</span>
                        <div>{new Date(selectedStep.timestamp).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Real Workflow Info */}
                {realWorkflowData && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Workflow Execution Details</h4>
                    <div className="bg-purple-50 p-4 rounded-md text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium text-purple-700">Workflow ID:</span>
                          <div className="text-purple-600">{realWorkflowData.id}</div>
                        </div>
                        <div>
                          <span className="font-medium text-purple-700">Execution Type:</span>
                          <div className="text-purple-600">{realWorkflowData.type}</div>
                        </div>
                        <div>
                          <span className="font-medium text-purple-700">Started At:</span>
                          <div className="text-purple-600">{new Date(realWorkflowData.metadata.startedAt).toLocaleString()}</div>
                        </div>
                        <div>
                          <span className="font-medium text-purple-700">Duration:</span>
                          <div className="text-purple-600">{realWorkflowData.metadata.totalDuration ? `${realWorkflowData.metadata.totalDuration}ms` : 'Running'}</div>
                        </div>
                      </div>
                      {realWorkflowData.langfuseTraceId && (
                        <div>
                          <span className="font-medium text-purple-700">Langfuse Trace ID:</span>
                          <div className="text-purple-600 font-mono text-xs">{realWorkflowData.langfuseTraceId}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* A2A Protocol Info */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">A2A Protocol Details</h4>
                  <div className="bg-yellow-50 p-4 rounded-md text-xs space-y-1">
                    <div>JSON-RPC 2.0-based messaging.</div>
                    <div>Async task processing with status tracking.</div>
                    <div>Direct communication between agents.</div>
                    <div>Standardized message format.</div>
                    {realWorkflowData && <div>This data was loaded from the real execution history.</div>}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
