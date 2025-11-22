const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Serve Swagger UI from backend/swagger.yaml
const swaggerDocument = YAML.load(path.join(__dirname, '..', 'swagger.yaml'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health
app.get('/', (req, res) => {
  res.send({ status: 'ok', message: 'InventoryTrack backend' });
});

// Products endpoints
app.get('/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { id: 'asc' } });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/products', async (req, res) => {
  const { name, sku, description, currentStock = 0, reorderLevel = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const product = await prisma.product.create({
      data: { name, sku, description, currentStock: Number(currentStock), reorderLevel: Number(reorderLevel) }
    });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const updated = await prisma.product.update({ where: { id }, data: req.body });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.product.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Transactions
app.post('/transactions', async (req, res) => {
  const { type, productId, quantity, note } = req.body;
  if (!['IN', 'OUT'].includes(type)) return res.status(400).json({ error: 'type must be IN or OUT' });
  const q = Number(quantity);
  if (!productId || isNaN(q) || q <= 0) return res.status(400).json({ error: 'Valid productId and positive quantity required' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: Number(productId) } });
      if (!product) throw new Error('Product not found');
      const newStock = type === 'IN' ? product.currentStock + q : product.currentStock - q;
      if (newStock < 0) throw new Error('Insufficient stock');
      const updated = await tx.product.update({ where: { id: product.id }, data: { currentStock: newStock } });
      const tr = await tx.transaction.create({ data: { type, productId: product.id, quantity: q, note } });
      return { product: updated, transaction: tr };
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const trs = await prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, include: { product: true } });
    res.json(trs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.listen(PORT, () => {
  console.log(`InventoryTrack backend listening on port ${PORT}`);
});