import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://satkulchimdnnczsdqoh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TOdTZAZ11zPvU_dA2M14ZA_c2efUJef';

function extractText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload?.output || []) {
    for (const c of item?.content || []) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: 'Consultor inteligente ainda não ativado no servidor.' });

  const auth = req.headers.authorization || '';
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: auth } } });

  try {
    const { document_id, family_context = {} } = req.body || {};
    if (!document_id) throw new Error('Documento não informado.');

    const { data: doc, error: docError } = await client.from('financial_documents').select('*').eq('id', document_id).single();
    if (docError || !doc) throw new Error('Documento não encontrado ou sem permissão.');

    await client.from('financial_documents').update({ status: 'analyzing', analysis_error: null, updated_at: new Date().toISOString() }).eq('id', document_id);

    const { data: signed, error: signError } = await client.storage.from('financial-documents').createSignedUrl(doc.storage_path, 300);
    if (signError || !signed?.signedUrl) throw new Error('Não foi possível preparar o documento para análise.');

    const instructions = `Você é o Consultor Financeiro do app Nossa Casa. Analise documentos financeiros de uma família brasileira com rigor, prudência e linguagem clara. Não dê garantias de negociação, não invente taxas ou condições ausentes e diferencie claramente dados extraídos, cálculos/inferências e recomendações. Procure, quando aplicável: taxa nominal, taxa efetiva, CET, juros do rotativo, encargos, anuidade, tarifas, saldo devedor, valor e quantidade de parcelas, condições de antecipação, vencimentos, benefícios de conta/cartão descritos no documento, custo total e oportunidades de redução de custo. Compare com o contexto financeiro fornecido pela família quando útil. Não importe nem altere dados no orçamento. Responda SOMENTE em JSON válido com esta estrutura: {"document_summary":"...","extracted_terms":[{"label":"...","value":"...","source":"..."}],"findings":[{"title":"...","detail":"...","severity":"info|attention|high"}],"opportunities":[{"title":"...","detail":"...","estimated_impact":"..."}],"scenarios":[{"title":"...","detail":"..."}],"next_actions":["..."],"cautions":["..."],"source_notes":["..."]}. Se um dado não estiver no documento, diga explicitamente que não foi localizado.`;

    const attachment = doc.mime_type?.startsWith('image/')
      ? { type: 'input_image', image_url: signed.signedUrl, detail: 'high' }
      : { type: 'input_file', filename: doc.file_name, file_url: signed.signedUrl };

    const aiResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
        instructions,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: `Tipo informado: ${doc.document_type}. Contexto da família: ${JSON.stringify(family_context)}. Analise o documento anexado.` },
          attachment
        ] }]
      })
    });

    const aiJson = await aiResp.json();
    if (!aiResp.ok) throw new Error(aiJson?.error?.message || 'Falha na análise do documento.');
    const raw = extractText(aiJson);
    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      analysis = { document_summary: raw || 'Análise concluída sem estruturação.', extracted_terms: [], findings: [], opportunities: [], scenarios: [], next_actions: [], cautions: [], source_notes: [] };
    }

    const { error: saveError } = await client.from('financial_documents').update({ status: 'completed', analysis, analysis_error: null, updated_at: new Date().toISOString() }).eq('id', document_id);
    if (saveError) throw saveError;
    return res.status(200).json({ analysis });
  } catch (error) {
    return res.status(400).json({ error: error?.message || String(error) });
  }
}
