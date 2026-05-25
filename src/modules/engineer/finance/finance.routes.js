import express from 'express';
import {
  getWalletBalance,
  requestWithdrawal,
  getTransactionHistory,
  getBankAccount
} from './finance.controller.js';
import { getEngineerEarnings } from '../requests/request.controller.js';
import { authenticateEngineer } from '../../../middleware/authMiddleWare.js';
import { walletLimiter } from '../../../middleware/rateLimiter.js';

const router = express.Router();

router.get("/earnings", authenticateEngineer, getEngineerEarnings);
router.get("/wallet", authenticateEngineer, getWalletBalance);
router.post("/withdraw", authenticateEngineer, walletLimiter, requestWithdrawal);
router.get("/transactions", authenticateEngineer, getTransactionHistory);
router.get("/bank-account", authenticateEngineer, getBankAccount);

export default router;
