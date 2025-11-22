const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.transaction.deleteMany();
  await prisma.product.deleteMany();

  await prisma.product.createMany({
    data: [
      { name: 'Pens', sku: 'PEN-001', currentStock: 100, reorderLevel: 10 },
      { name: 'Notebooks', sku: 'NB-003', currentStock: 50, reorderLevel: 5 },
      { name: 'Staplers', sku: 'STP-01', currentStock: 20, reorderLevel: 2 }
    ]
  });

  console.log('Seed finished.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());