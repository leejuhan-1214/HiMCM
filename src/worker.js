import { sensitivity, uncertainty } from './model.js';
self.onmessage = ({ data }) => {
  const { id, task, params, options } = data;
  try {
    const result = task === 'sensitivity'
      ? sensitivity(params, options.metric, options.delta)
      : uncertainty(params, options);
    self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
