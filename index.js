// index.js
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Try multiple likely locations for swagger.yaml so deployment folders don't break us.
const possibleSwaggerPaths = [
  path.join(__dirname, 'swagger.yaml'),        // when index.js is in repo root
  path.join(__dirname, 'src', 'swagger.yaml'),// when index.js is in root but swagger in src
  path.join(__dirname, '..', 'swagger.yaml'), // when index.js is in src folder
  path.join(process.cwd(), 'swagger.yaml')     // fallback to process cwd
];

let swaggerDocument = null;
let swaggerPathFound = null;

for (const p of possibleSwaggerPaths) {
  if (fs.existsSync(p)) {
    try {
      swaggerDocument = YAML.load(p);
      swaggerPathFound = p;
      console.log('Loaded swagger from', p);
      break;
    } catch (err) {
      console.warn('Found swagger at', p, 'but failed to parse it:', err.message);
    }
  }
}

if (swaggerDocument) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} else {
  // If swagger not found, provide a small placeholder route so the server doesn't crash
  app.get('/docs', (req, res) => {
    res.status(200).send({
      message: 'Swagger file not found on server. API is still running. Please check repository for swagger.yaml'
    });
  });
  console.warn('Swagger YAML not found in any expected path:', possibleSwaggerPaths);
}

// Health
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'InventoryTrack backend' });
});

// -- Products endpoints (unchanged) --
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
  if (swaggerPathFound) console.log('Swagger served from:', swaggerPathFound);
});
