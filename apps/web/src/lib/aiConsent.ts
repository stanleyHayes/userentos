const paths = new Set(['/ai/chat', '/ai/generate', '/ai/listing', '/ai/formalize', '/ai/translate', '/ai/case-summary', '/properties/search/semantic'])
export const AI_SHARING_VERSION = 'anthropic-openai-2026-09-13'
export function needsAiConsent(path: string): boolean { return paths.has(path.split('?')[0]) }
export function confirmAiSharing(path: string): boolean {
  return window.confirm(aiSharingMessage(path))
}

export class AiConsentDeclined extends Error { constructor() { super('AI request cancelled. Nothing was sent to AI providers.') } }

export function aiSharingMessage(path: string): string {
  const route = path.split('?')[0]
  const recipients = route === '/properties/search/semantic'
    ? 'RentOS will send your search text to OpenAI to find properties with similar meaning.'
    : route === '/ai/chat'
      ? 'RentOS will send the conversation so far to Anthropic to generate an AI response. Your latest question is also sent to OpenAI for legal document matching when configured.'
      : 'RentOS will send the text and details in this request to Anthropic to generate an AI response.'
  return recipients + '\n\nRemove names, identity numbers, financial details or other private information you do not want to share. Only include other people’s information if you are allowed to share it. AI results can be wrong.\n\nAllow sharing for this request? Cancelling keeps your text and does not send it.'
}
