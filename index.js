const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
mongoose.Promise=global.Promise;
mongoose.connect('mongodb://127.0.0.1:27017',{
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define Schema for Product Transaction
const productTransactionSchema = new mongoose.Schema({
  dateOfSale: Date,
  title: String,
  description: String,
  price: Number,
  category: String,
});

const ProductTransaction = mongoose.model('ProductTransaction', productTransactionSchema);

// Initialize database with seed data from third-party API
async function initializeDatabase() {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const transactions = response.data;
    await ProductTransaction.insertMany(transactions);
    console.log('Database initialized with seed data.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize database on server start
initializeDatabase();

// API to list all transactions with search and pagination
app.get('/transactions', async (req, res) => {
  const { month, search, page = 1, perPage = 10 } = req.query;
  const monthRegex = new RegExp(month, 'i');
  const searchRegex = new RegExp(search, 'i');
  
  const query = {
    dateOfSale: { $regex: monthRegex },
    $or: [
      { title: { $regex: searchRegex } },
      { description: { $regex: searchRegex } },
      { price: { $regex: searchRegex } }
    ]
  };
  
  try {
    const transactions = await ProductTransaction.find(query)
      .skip((page - 1) * perPage)
      .limit(perPage);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API for statistics
app.get('/statistics', async (req, res) => {
  const { month } = req.query;
  const monthRegex = new RegExp(month, 'i');

  try {
    const totalSaleAmount = await ProductTransaction.aggregate([
      { $match: { dateOfSale: { $regex: monthRegex } } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    
    const totalSoldItems = await ProductTransaction.countDocuments({ dateOfSale: { $regex: monthRegex } });
    const totalNotSoldItems = await ProductTransaction.countDocuments({ dateOfSale: { $regex: monthRegex }, price: 0 });

    res.json({
      totalSaleAmount: totalSaleAmount.length > 0 ? totalSaleAmount[0].total : 0,
      totalSoldItems,
      totalNotSoldItems
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API for bar chart
app.get('/bar-chart', async (req, res) => {
  const { month } = req.query;
  const monthRegex = new RegExp(month, 'i');

  try {
    const priceRanges = [
      { range: '0 - 100', count: await ProductTransaction.countDocuments({ dateOfSale: { $regex: monthRegex }, price: { $lte: 100 } }) },
      { range: '101 - 200', count: await ProductTransaction.countDocuments({ dateOfSale: { $regex: monthRegex }, price: { $gt: 100, $lte: 200 } }) },
      // Repeat for other ranges
    ];

    res.json(priceRanges);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API for pie chart
app.get('/pie-chart', async (req, res) => {
  const { month } = req.query;
  const monthRegex = new RegExp(month, 'i');

  try {
    const categories = await ProductTransaction.aggregate([
      { $match: { dateOfSale: { $regex: monthRegex } } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Combined API
app.get('/combined-data', async (req, res) => {
  const { month } = req.query;

  try {
    const [transactions, statistics, barChart, pieChart] = await Promise.all([
      axios.get(`http://localhost:${PORT}/transactions?month=${month}`),
      axios.get(`http://localhost:${PORT}/statistics?month=${month}`),
      axios.get(`http://localhost:${PORT}/bar-chart?month=${month}`),
      axios.get(`http://localhost:${PORT}/pie-chart?month=${month}`),
    ]);

    res.json({
      transactions: transactions.data,
      statistics: statistics.data,
      barChart: barChart.data,
      pieChart: pieChart.data,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
