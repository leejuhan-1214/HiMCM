import { sensitivity, uncertainty, morris } from './model.js?v=2.6.0';
const tasks = {
  sensitivity: (params, options) => sensitivity(params, options.metric, options.delta),
  uncertainty: (params, options) => uncertainty(params, options),
  morris: (params, options) => morris(params, options),
};
self.onmessage = ({ data }) => {
  const { id, task, params, options } = data;
  try {
    if (!tasks[task]) throw new Error(`Unknown analysis task: ${task}`);
    self.postMessage({ id, result: tasks[task](params, options) });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
