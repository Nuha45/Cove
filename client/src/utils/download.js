import api from '../services/api';

function filenameFrom(disposition, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(disposition || '');
  return match ? match[1] : fallback;
}

// Blob errors come back as Blob bodies; turn them into readable messages for getErrorMessage.
async function normalizeBlobError(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      err.response.data = parsed;
    } catch {
      // keep original
    }
  }
  throw err;
}

export async function fetchBlob(path, params) {
  try {
    const res = await api.get(path, { params, responseType: 'blob' });
    return { blob: res.data, disposition: res.headers['content-disposition'] };
  } catch (err) {
    return normalizeBlobError(err);
  }
}

export async function downloadFile(path, params, fallbackName) {
  const { blob, disposition } = await fetchBlob(path, params);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(disposition, fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Opens a PDF in a new tab. The tab is opened synchronously so popup blockers allow it.
export async function openPdf(path, params) {
  const tab = window.open('', '_blank');
  try {
    const { blob } = await fetchBlob(path, params);
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    if (tab) {
      tab.location.href = url;
    } else {
      window.location.assign(url);
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (tab) tab.close();
    throw err;
  }
}
