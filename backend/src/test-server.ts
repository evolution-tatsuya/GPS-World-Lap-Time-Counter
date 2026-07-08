import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Simple test server' });
});

app.listen(8432, () => {
  console.log('Test server running on http://localhost:8432');
});
