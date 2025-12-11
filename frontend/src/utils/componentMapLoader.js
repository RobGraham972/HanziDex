let componentMap = null;
let loadingPromise = null;

export async function loadComponentMap() {
  if (componentMap) return componentMap;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch('/data/character_component_map.json')
    .then(res => {
      if (!res.ok) throw new Error('Failed to load map');
      return res.json();
    })
    .then(data => {
      componentMap = data;
      return data;
    })
    .catch(err => {
      console.error("Failed to load component map", err);
      return {};
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}
