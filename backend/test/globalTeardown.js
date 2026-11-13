'use strict';
module.exports = async () => {
  if (globalThis.__VAMORA_PG__) await globalThis.__VAMORA_PG__.stop();
};
