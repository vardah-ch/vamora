import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Patient accessibility preferences, stored on the server (so they follow the
 * person across devices): textSize, readAloud, language, moodCameraOptIn.
 * Text size is applied to the whole page via <html data-text-size>.
 */
export function applyTextSize(size) {
  document.documentElement.dataset.textSize = size || 'normal';
}

export function usePreferences() {
  const [prefs, setPrefs] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/privacy/preferences')
      .then(({ data }) => { if (alive) { setPrefs(data || {}); applyTextSize(data?.textSize); } })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, []);

  const update = useCallback(async (patch) => {
    const { data } = await api.put('/privacy/preferences', patch);
    setPrefs(data);
    applyTextSize(data.textSize);
    return data;
  }, []);

  return { prefs, loaded, update };
}
