const backupStatus = document.getElementById('backupStatus');
const backupKey = key => typeof key === 'string' && key.length <= 120 &&
  (key.startsWith('loja-') || key.startsWith('painel-loja-diadema-'));

async function backupRequest(method, body) {
  const response = await fetch('/api/data', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível acessar os dados da loja.');
  return result;
}

document.getElementById('downloadBackup').addEventListener('click', async () => {
  try {
    backupStatus.textContent = 'Preparando o backup…';
    const { records = [] } = await backupRequest('GET');
    const data = Object.fromEntries(records.filter(record => backupKey(record.key))
      .map(record => [record.key, record.value]));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-loja-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupStatus.textContent = `Backup baixado com ${records.length} áreas de dados.`;
  } catch (error) { backupStatus.textContent = error.message; }
});

const fileInput = document.getElementById('backupFile');
document.getElementById('restoreBackup').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('O arquivo não contém um backup válido.');
    const entries = Object.entries(parsed).filter(([key]) => backupKey(key))
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);
    if (!entries.length || entries.some(([, value]) => typeof value !== 'string' || value.length > 5_000_000)) {
      throw new Error('O arquivo não contém dados válidos da loja.');
    }
    if (!confirm(`Restaurar ${entries.length} áreas de dados? Os dados atuais dessas áreas serão substituídos. Faça um backup antes de continuar.`)) return;
    backupStatus.textContent = 'Conferindo os dados atuais…';
    const { records = [] } = await backupRequest('GET');
    const revisions = new Map(records.map(record => [record.key, Number(record.revision)]));
    let completed = 0;
    for (const [key, value] of entries) {
      await backupRequest('PUT', { key, value, baseRevision: revisions.get(key) || 0 });
      backupStatus.textContent = `Restaurando… ${++completed}/${entries.length}`;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('cloud-pending:')) localStorage.removeItem(key);
    }
    backupStatus.textContent = `${completed} áreas restauradas. Atualizando o painel…`;
    location.reload();
  } catch (error) {
    backupStatus.textContent = `Não foi possível concluir a restauração: ${error.message}. Confira o banco antes de tentar novamente.`;
  } finally { fileInput.value = ''; }
});
