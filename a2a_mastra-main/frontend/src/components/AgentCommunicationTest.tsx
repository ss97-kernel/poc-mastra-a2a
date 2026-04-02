'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Send, MessageSquare, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface TestMessage {
  id: string
  timestamp: Date
  fromAgent: string
  toAgent: string
  message: string
  response?: unknown
  status: 'sending' | 'completed' | 'failed'
  duration?: number
}

const AGENT_OPTIONS = [
  { value: 'data-processor', label: 'Data Processor', endpoint: 'http://data-processor:3002' },
  { value: 'summarizer', label: 'Summarizer', endpoint: 'http://summarizer:3003' },
  { value: 'web-search', label: 'Web Search', endpoint: 'http://web-search:3004' },
]

const SAMPLE_MESSAGES = {
  'data-processor': [
    '{ "type": "process", "data": [1, 2, 3, 4, 5], "context": { "source": "test" } }',
    '{ "type": "analyze", "data": { "sales": [100, 150, 200], "months": ["Jan", "Feb", "Mar"] } }',
  ],
  'summarizer': [
    '{ "type": "summarize", "data": "Large data analysis result...", "audienceType": "executive" }',
    '{ "type": "executive-summary", "data": "Complex business data...", "audienceType": "executive" }',
  ],
  'web-search': [
    '{ "type": "web-search", "query": "TypeScript latest features", "options": { "maxResults": 5 } }',
    '{ "type": "news-search", "query": "AI market trends", "options": { "timeRange": "week" } }',
    '{ "type": "scholarly-search", "query": "machine learning transformer", "options": { "language": "en" } }',
  ],
}

export function AgentCommunicationTest() {
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [messages, setMessages] = useState<TestMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const sendTestMessage = async () => {
    if (!selectedAgent || !message.trim()) return

    const testMessage: TestMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      fromAgent: 'gateway',
      toAgent: selectedAgent,
      message: message.trim(),
      status: 'sending'
    }

    setMessages(prev => [testMessage, ...prev])
    setIsLoading(true)

    const startTime = Date.now()

    try {
      // Send A2A message to selected agent via gateway
      const response = await fetch('/api/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          selectedAgent === 'web-search' 
            ? JSON.parse(message) // For web search, parse the full message JSON
            : {
                type: selectedAgent === 'data-processor' ? 'process' : 'summarize',
                data: message,
                context: { source: 'agent-communication-test' }
              }
        ),
      })

      const duration = Date.now() - startTime
      const result = await response.json()

      setMessages(prev => prev.map(msg => 
        msg.id === testMessage.id 
          ? { 
              ...msg, 
              status: response.ok ? 'completed' : 'failed',
              response: result,
              duration 
            }
          : msg
      ))

    } catch (error) {
      const duration = Date.now() - startTime
      
      setMessages(prev => prev.map(msg => 
        msg.id === testMessage.id 
          ? { 
              ...msg, 
              status: 'failed',
              response: { error: error instanceof Error ? error.message : 'Unknown error' },
              duration 
            }
          : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }

  const loadSampleMessage = (agentType: string, index: number) => {
    const samples = SAMPLE_MESSAGES[agentType as keyof typeof SAMPLE_MESSAGES]
    if (samples && samples[index]) {
      setMessage(samples[index])
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sending':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Inter-Agent Communication Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Target Agent</label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {AGENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedAgent && (
            <div>
              <label className="text-sm font-medium mb-2 block">Sample Messages</label>
              <div className="flex gap-2">
                {SAMPLE_MESSAGES[selectedAgent as keyof typeof SAMPLE_MESSAGES]?.map((_, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => loadSampleMessage(selectedAgent, index)}
                  >
                    Sample {index + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Message (JSON)</label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter a JSON message..."
            rows={4}
            className="font-mono text-sm"
          />
        </div>

        <Button
          onClick={sendTestMessage}
          disabled={!selectedAgent || !message.trim() || isLoading}
          className="w-full"
        >
          <Send className="h-4 w-4 mr-2" />
          Send A2A Message
        </Button>

        {messages.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Communication History</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {messages.map((msg) => (
                <Card key={msg.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(msg.status)}
                        <span className="text-sm font-medium">
                          {msg.fromAgent} → {msg.toAgent}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          A2A
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {msg.duration && (
                          <span>{msg.duration}ms</span>
                        )}
                        <span>{msg.timestamp.toLocaleTimeString()}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Sent Message:</span>
                        <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto">
                          {msg.message}
                        </pre>
                      </div>
                      
                      {msg.response !== undefined && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {msg.status === 'failed' ? 'Error:' : 'Response:'}
                          </span>
                          <pre className={cn(
                            "text-xs p-2 rounded mt-1 overflow-x-auto",
                            msg.status === 'failed' ? "bg-red-50" : "bg-green-50"
                          )}>
                            {typeof msg.response === 'string' ? msg.response : JSON.stringify(msg.response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="p-3 bg-blue-50 rounded-md">
          <h4 className="text-sm font-medium text-blue-900 mb-2">A2A Communication Flow</h4>
          <div className="text-xs text-blue-700 space-y-1">
            <div>1. The Gateway Agent receives the request.</div>
            <div>2. It sends a message to the target agent with A2A `sendMessage()`.</div>
            <div>3. The target agent processes the task.</div>
            <div>4. The gateway retrieves the result with A2A `getTask()`.</div>
            <div>5. The Gateway Agent returns the result to the client.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
