'use strict';
document.getElementById('open-ai-assistant')?.addEventListener('click',()=>{
  window.deckBridge?.openAiAssistant?.().catch(error=>window.d200xActionStatus?.('AI 도우미 열기 실패: '+String(error?.message||error)));
});
