import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'meetify-api',
  });
});

export default router;
