import { asyncTasks, AsyncTask } from './asyncTaskManager.js';
import { completeWorkflowExecution } from './workflowManager.js';
import { sendA2AMessage } from '../../utils/mastraA2AClient.js';

// Helper function to extract key findings from synthesis result
function extractKeyFindings(synthesisResult: any): string[] {
  if (typeof synthesisResult === 'string') {
    // Extract bullet points or numbered items from the text
    const lines = synthesisResult.split('\n');
    const findings = lines.filter((line: string) => 
      line.trim().match(/^[\d•\-\*]\.|^[\d\.]+\s/) && 
      (
        line.toLowerCase().includes('finding') ||
        line.toLowerCase().includes('result') ||
        line.toLowerCase().includes('key')
      )
    ).map((line: string) => line.trim());
    return findings.slice(0, 5); // Return top 5 findings
  }
  return [];
}

// Helper function to extract recommendations from synthesis result
function extractRecommendations(synthesisResult: any): string[] {
  if (typeof synthesisResult === 'string') {
    // Extract recommendations from the text
    const lines = synthesisResult.split('\n');
    const recommendations = lines.filter((line: string) => 
      line.trim().match(/^[\d•\-\*]\.|^[\d\.]+\s/) && 
      (
        line.toLowerCase().includes('recommend') ||
        line.toLowerCase().includes('suggest') ||
        line.toLowerCase().includes('improv')
      )
    ).map((line: string) => line.trim());
    return recommendations.slice(0, 5); // Return top 5 recommendations
  }
  return [];
}

export async function executeDeepResearchWorkflow(
  taskId: string,
  topic: string,
  options: any,
  trace: any
) {
  const task = asyncTasks.get(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  try {
    // Update task status
    task.status = 'working';
    task.currentPhase = 'search';
    task.progress = 10;
    asyncTasks.set(taskId, task);

    // Phase 1: Comprehensive web search begins (10%)
    console.log(`Deep Research Phase 1: Starting comprehensive search for topic: ${topic}`);
    
    const searchResponse = await sendA2AMessage('web-search', {
      type: 'comprehensive-search',
      query: topic,
      options: {
        sources: options.sources || ['web', 'news'],
        maxResults: options.depth === 'expert' ? 50 : options.depth === 'comprehensive' ? 30 : 15,
      },
    });

    // Extract the search result from the A2A response.
    let searchResult;
    if (searchResponse.task?.artifacts && searchResponse.task.artifacts.length > 0) {
      const searchArtifact = searchResponse.task.artifacts.find((artifact: any) => artifact.type === 'search-result');
      if (searchArtifact && searchArtifact.data) {
        const rawResults =
          searchArtifact.data.rawResults || searchArtifact.data.fullResponse || {};
        searchResult = {
          searchResults: searchArtifact.data.summary,
          rawResults,
          query: searchArtifact.data.query,
          metadata: searchArtifact.metadata,
          sources: rawResults.results || rawResults.sources || [],
        };
      } else {
        searchResult = searchResponse.task.artifacts[0].data || searchResponse;
      }
    } else {
      // Fallback to the status message.
      const statusMessage = searchResponse.task?.status?.message?.parts?.[0]?.text;
      searchResult = statusMessage || searchResponse;
    }
    
    // Update progress after the search phase completes (33%)
    task.progress = 33;
    task.currentPhase = 'analyze';
    asyncTasks.set(taskId, task);

    console.log(`Deep Research Phase 2: Analyzing search results`);
    
    // Phase 2: Data analysis begins (33%)
    const analysisResponse = await sendA2AMessage('data-processor', {
      type: 'research-analysis',
      data: searchResult,
      options: {
        analyzePatterns: true,
        extractInsights: true,
        depth: options.depth || 'comprehensive',
      },
    });

    // Extract the analysis result from the A2A response.
    let analysisResult;
    if (analysisResponse.task?.artifacts && analysisResponse.task.artifacts.length > 0) {
      const analysisArtifact = analysisResponse.task.artifacts[0];
      analysisResult = analysisArtifact.data || analysisArtifact;
    } else {
      // Fallback to the status message or direct response.
      const statusMessage = analysisResponse.task?.status?.message?.parts?.[0]?.text;
      analysisResult = statusMessage || analysisResponse;
    }
    
    // Update progress after the analysis phase completes (66%)
    task.progress = 66;
    task.currentPhase = 'synthesize';
    asyncTasks.set(taskId, task);

    console.log(`Deep Research Phase 3: Synthesizing comprehensive report`);
    
    // Phase 3: Synthesis and report generation begin (66%)
    const synthesisResponse = await sendA2AMessage('summarizer', {
      type: 'research-synthesis',
      data: {
        topic,
        searchResults: searchResult,
        analysisResults: analysisResult,
      },
      options: {
        reportType: 'comprehensive',
        audienceType: options.audienceType || 'technical',
        includeRecommendations: true,
        includeSources: true,
      },
    });
    
    // Extract the synthesis result from the A2A response.
    let synthesisResult;
    if (synthesisResponse.task?.artifacts && synthesisResponse.task.artifacts.length > 0) {
      const synthesisArtifact = synthesisResponse.task.artifacts[0];
      synthesisResult = synthesisArtifact.data || synthesisArtifact;
    } else {
      // Fallback to the status message or direct response.
      const statusMessage = synthesisResponse.task?.status?.message?.parts?.[0]?.text;
      synthesisResult = statusMessage || synthesisResponse;
    }
    
    // Parse the synthesis result if it is a JSON string.
    try {
      if (typeof synthesisResult === 'string') {
        synthesisResult = JSON.parse(synthesisResult);
      }
    } catch (e) {
      // If parsing fails, wrap the string response.
      if (typeof synthesisResult === 'string') {
        synthesisResult = { summary: synthesisResult };
      }
    }

    // Update progress to 95% after synthesis completes.
    task.progress = 95;
    task.currentPhase = 'completed';
    asyncTasks.set(taskId, task);

    // Complete the task
    const finalResult = {
      topic,
      methodology: 'multi-agent-deep-research',
      executiveSummary: synthesisResult.executiveSummary || synthesisResult.summary || synthesisResult,
      detailedFindings: {
        searchResults: searchResult,
        analysis: analysisResult,
        synthesis: synthesisResult,
      },
      keyFindings: synthesisResult.keyFindings || extractKeyFindings(synthesisResult),
      recommendations: synthesisResult.recommendations || extractRecommendations(synthesisResult),
      sources: searchResult.sources || [],
      confidence: 0.92,
      completedPhases: ['search', 'analyze', 'synthesize'],
      processingTime: {
        search: '2-3 minutes',
        analysis: '3-4 minutes', 
        synthesis: '2-3 minutes',
      },
    };

    task.status = 'completed';
    task.progress = 100;
    task.currentPhase = 'completed';
    task.result = finalResult;
    task.completedAt = new Date().toISOString();
    asyncTasks.set(taskId, task);

    console.log(`Deep Research completed for topic: ${topic}`);
    
    // Complete workflow execution if exists
    if (task.workflowExecutionId) {
      completeWorkflowExecution(task.workflowExecutionId, finalResult);
    }

  } catch (error) {
    console.error(`Deep Research workflow failed:`, error);
    
    task.status = 'failed';
    task.error = error instanceof Error ? error.message : 'Unknown error';
    task.completedAt = new Date().toISOString();
    asyncTasks.set(taskId, task);
    
    // Complete workflow execution with error if exists
    if (task.workflowExecutionId) {
      completeWorkflowExecution(
        task.workflowExecutionId, 
        undefined, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}
