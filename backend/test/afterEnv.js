'use strict';
afterAll(async () => {
  await require('../models').sequelize.close();
});
