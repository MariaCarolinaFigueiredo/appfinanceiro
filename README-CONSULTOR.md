# Consultor Financeiro — análise de documentos

Esta versão inclui a interface para upload e análise de documentos financeiros, armazenamento privado no Supabase e uma função serverless do Vercel em `api/analyze-document.js`.

Para ativar a análise por IA em produção, configure no projeto Vercel a variável de ambiente:

- `OPENAI_API_KEY` = chave da OpenAI API
- opcional: `OPENAI_MODEL` = modelo desejado (padrão: `gpt-5.6-terra`)

Depois de salvar a variável, faça um redeploy do projeto. A chave nunca deve ser colocada no `index.html`.

Formatos aceitos: PDF, JPG, PNG e WEBP, até 10 MB.

A análise não importa nem altera dados do orçamento. Ela apenas produz leitura, identificação de taxas/encargos, oportunidades, cenários e próximos passos.
