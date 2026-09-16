const express = require('express');
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  createRules,
  updateRules,
  listRules,
  idRule,
} = require('../validators/productValidator');
const productController = require('../controllers/productController');

const router = express.Router();

router.use(protect);
router.get('/', listRules, validate, productController.list);
router.post('/', writeLimiter, createRules, validate, productController.create);
router.get('/:id', idRule, validate, productController.getOne);
router.patch('/:id', writeLimiter, updateRules, validate, productController.update);
router.delete('/:id', writeLimiter, idRule, validate, productController.remove);

module.exports = router;
