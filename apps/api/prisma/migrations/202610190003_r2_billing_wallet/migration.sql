-- Enum addition is a separate committed migration before WALLET is used.
ALTER TYPE "PaymentMethod" ADD VALUE 'WALLET';
