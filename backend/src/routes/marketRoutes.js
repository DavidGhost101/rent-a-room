const express = require('express');
const router = express.Router();
const marketInfoController = require('../controllers/MarketInfoController');

router.get('/', (req, res) => marketInfoController.getMarketInfo(req, res));

module.exports = router;
