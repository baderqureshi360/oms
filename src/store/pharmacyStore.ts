import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product, Sale, StockPurchase, SaleItem, StockBatch, BatchDeduction } from '@/types/pharmacy';
import { isBefore, parseISO, startOfToday, addDays } from 'date-fns';

interface PharmacyStore {
  // State data
  products: Product[];
  sales: Sale[];
  stockPurchases: StockPurchase[];
  stockBatches: StockBatch[];
  
  // Safety states for async operations and error handling
  isLoading: boolean;
  error: string | null;
  
  // Actions to manage safety states
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Product actions
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  getProductByBarcode: (barcode: string) => Product | undefined;
  
  // Stock calculations
  getProductStock: (productId: string) => number;
  getProductBatches: (productId: string) => StockBatch[];
  getAvailableBatches: (productId: string) => StockBatch[]; // Non-expired batches sorted by FEFO
  getExpiringBatches: (days?: number) => StockBatch[];
  getExpiredBatches: () => StockBatch[];
  
  // Sales actions
  addSale: (items: SaleItem[], paymentMethod: 'cash' | 'card' | 'mobile', discount?: number) => { success: boolean; error?: string; saleId?: string };
  
  // Stock purchase actions (adds batch)
  addStockPurchase: (purchase: Omit<StockPurchase, 'id'>) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// Sample products (without stock - stock comes from batches now)
const sampleProducts: Product[] = [
  {
    id: '1',
    name: 'Paracetamol',
    strength: '500mg',
    dosageForm: 'Tablet',
    barcode: '8901234567890',
    category: 'Pain Relief',
    price: 5.99,
    costPrice: 3.50,
    minStock: 30,
    supplier: 'PharmaCo',
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Ibuprofen',
    strength: '400mg',
    dosageForm: 'Tablet',
    barcode: '8901234567891',
    category: 'Pain Relief',
    price: 7.99,
    costPrice: 4.50,
    minStock: 30,
    supplier: 'MediSupply',
    createdAt: '2024-01-16',
  },
  {
    id: '3',
    name: 'Vitamin C',
    strength: '1000mg',
    dosageForm: 'Tablet',
    barcode: '8901234567892',
    category: 'Vitamins',
    price: 12.99,
    costPrice: 8.00,
    minStock: 20,
    supplier: 'VitaHealth',
    createdAt: '2024-01-17',
  },
  {
    id: '4',
    name: 'Amoxicillin',
    strength: '250mg',
    dosageForm: 'Capsule',
    barcode: '8901234567893',
    category: 'Antibiotics',
    price: 15.99,
    costPrice: 10.00,
    minStock: 15,
    supplier: 'PharmaCo',
    createdAt: '2024-01-18',
  },
  {
    id: '5',
    name: 'Cough Syrup',
    strength: '100ml',
    dosageForm: 'Syrup',
    barcode: '8901234567894',
    category: 'Cold & Flu',
    price: 8.49,
    costPrice: 5.00,
    minStock: 25,
    supplier: 'MediSupply',
    createdAt: '2024-01-19',
  },
];

// Sample batches with varying expiry dates
const sampleBatches: StockBatch[] = [
  {
    id: 'b1',
    productId: '1',
    batchNumber: 'PCM-2024-001',
    quantity: 100,
    costPrice: 3.50,
    sellingPrice: 5.99,
    expiryDate: '2025-06-15',
    purchaseDate: '2024-01-15',
    supplier: 'PharmaCo',
  },
  {
    id: 'b2',
    productId: '1',
    batchNumber: 'PCM-2024-002',
    quantity: 50,
    costPrice: 3.50,
    sellingPrice: 5.99,
    expiryDate: '2025-03-01', // Expiring sooner - should be sold first (FEFO)
    purchaseDate: '2024-02-01',
    supplier: 'PharmaCo',
  },
  {
    id: 'b3',
    productId: '2',
    batchNumber: 'IBU-2024-001',
    quantity: 25,
    costPrice: 4.50,
    sellingPrice: 7.99,
    expiryDate: '2025-02-15', // Expiring soon
    purchaseDate: '2024-01-16',
    supplier: 'MediSupply',
  },
  {
    id: 'b4',
    productId: '3',
    batchNumber: 'VTC-2024-001',
    quantity: 80,
    costPrice: 8.00,
    sellingPrice: 12.99,
    expiryDate: '2026-01-10',
    purchaseDate: '2024-01-17',
    supplier: 'VitaHealth',
  },
  {
    id: 'b5',
    productId: '4',
    batchNumber: 'AMX-2024-001',
    quantity: 45,
    costPrice: 10.00,
    sellingPrice: 15.99,
    expiryDate: '2025-02-01', // Expiring soon
    purchaseDate: '2024-01-18',
    supplier: 'PharmaCo',
  },
  {
    id: 'b6',
    productId: '5',
    batchNumber: 'CSY-2024-001',
    quantity: 60,
    costPrice: 5.00,
    sellingPrice: 8.49,
    expiryDate: '2025-08-30',
    purchaseDate: '2024-01-19',
    supplier: 'MediSupply',
  },
];

export const usePharmacyStore = create<PharmacyStore>()(
  persist(
    (set, get) => ({
      // Initial state
      products: sampleProducts,
      sales: [],
      stockPurchases: [],
      stockBatches: sampleBatches,
      
      // Safety states with safe defaults
      isLoading: false,
      error: null,
      
      // Safety state management
      setLoading: (loading: boolean) => set({ isLoading: loading }),
      setError: (error: string | null) => set({ error }),
      clearError: () => set({ error: null }),

      addProduct: (product) =>
        set((state) => ({
          products: [
            ...state.products,
            {
              ...product,
              id: generateId(),
              createdAt: new Date().toISOString().split('T')[0],
            },
          ],
        })),

      updateProduct: (id, updates) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      deleteProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
          stockBatches: state.stockBatches.filter((b) => b.productId !== id),
        })),

      getProductByBarcode: (barcode) => {
        if (!barcode || typeof barcode !== 'string') {
          return undefined;
        }
        const products = get().products;
        if (!Array.isArray(products)) {
          return undefined;
        }
        return products.find((p) => p && p.barcode === barcode);
      },

      // Calculate total stock from all non-expired batches
      getProductStock: (productId) => {
        if (!productId || typeof productId !== 'string') {
          return 0;
        }
        const today = startOfToday();
        const batches = get().stockBatches;
        if (!Array.isArray(batches)) {
          return 0;
        }
        return batches
          .filter((b) => b && b.productId === productId && b.expiryDate && !isBefore(parseISO(b.expiryDate), today))
          .reduce((sum, b) => sum + (b.quantity || 0), 0);
      },

      // Get all batches for a product
      getProductBatches: (productId) => {
        if (!productId || typeof productId !== 'string') {
          return [];
        }
        const batches = get().stockBatches;
        if (!Array.isArray(batches)) {
          return [];
        }
        return batches.filter((b) => b && b.productId === productId);
      },

      // Get non-expired batches sorted by expiry date (FEFO - First Expiry First Out)
      getAvailableBatches: (productId) => {
        if (!productId || typeof productId !== 'string') {
          return [];
        }
        const today = startOfToday();
        const batches = get().stockBatches;
        if (!Array.isArray(batches)) {
          return [];
        }
        return batches
          .filter((b) => b && b.productId === productId && (b.quantity || 0) > 0 && b.expiryDate && !isBefore(parseISO(b.expiryDate), today))
          .sort((a, b) => {
            if (!a.expiryDate || !b.expiryDate) return 0;
            return parseISO(a.expiryDate).getTime() - parseISO(b.expiryDate).getTime();
          });
      },

      // Get batches expiring within specified days (default 30)
      getExpiringBatches: (days = 30) => {
        const today = startOfToday();
        const thresholdDate = addDays(today, days);
        return get().stockBatches
          .filter((b) => {
            const expiryDate = parseISO(b.expiryDate);
            return b.quantity > 0 && 
                   !isBefore(expiryDate, today) && 
                   isBefore(expiryDate, thresholdDate);
          })
          .sort((a, b) => parseISO(a.expiryDate).getTime() - parseISO(b.expiryDate).getTime());
      },

      // Get expired batches with remaining stock
      getExpiredBatches: () => {
        const today = startOfToday();
        return get().stockBatches
          .filter((b) => b.quantity > 0 && isBefore(parseISO(b.expiryDate), today))
          .sort((a, b) => parseISO(a.expiryDate).getTime() - parseISO(b.expiryDate).getTime());
      },

      // Add sale with FEFO deduction
      addSale: (items, paymentMethod, discount = 0) => {
        const state = get();
        const today = startOfToday();
        const updatedBatches = [...state.stockBatches];
        const itemsWithDeductions: SaleItem[] = [];

        // Validate and prepare deductions
        for (const item of items) {
          const availableBatches = updatedBatches
            .filter((b) => b.productId === item.productId && b.quantity > 0 && !isBefore(parseISO(b.expiryDate), today))
            .sort((a, b) => parseISO(a.expiryDate).getTime() - parseISO(b.expiryDate).getTime());

          const totalAvailable = availableBatches.reduce((sum, b) => sum + b.quantity, 0);
          
          if (totalAvailable < item.quantity) {
            return { 
              success: false, 
              error: `Insufficient stock for ${item.productName}. Available: ${totalAvailable}, Required: ${item.quantity}` 
            };
          }

          // Deduct from batches using FEFO
          let remainingQty = item.quantity;
          const deductions: BatchDeduction[] = [];

          for (const batch of availableBatches) {
            if (remainingQty <= 0) break;
            
            const batchIndex = updatedBatches.findIndex((b) => b.id === batch.id);
            const deductQty = Math.min(batch.quantity, remainingQty);
            
            updatedBatches[batchIndex] = {
              ...updatedBatches[batchIndex],
              quantity: updatedBatches[batchIndex].quantity - deductQty,
            };

            deductions.push({
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              quantity: deductQty,
              expiryDate: batch.expiryDate,
            });

            remainingQty -= deductQty;
          }

          itemsWithDeductions.push({
            ...item,
            batchDeductions: deductions,
          });
        }

        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const discountValue = discount > 0 ? (subtotal * discount / 100) : 0;
        const finalTotal = subtotal - discountValue;

        const saleId = generateId();
        const newSale: Sale = {
          id: saleId,
          items: itemsWithDeductions,
          total: finalTotal,
          paymentMethod,
          createdAt: new Date().toISOString(),
        };

        set({
          sales: [...state.sales, newSale],
          stockBatches: updatedBatches,
        });

        return { success: true, saleId };
      },

      // Add stock purchase (creates a new batch)
      addStockPurchase: (purchase) =>
        set((state) => {
          const newBatch: StockBatch = {
            id: generateId(),
            productId: purchase.productId,
            batchNumber: purchase.batchNumber,
            quantity: purchase.quantity,
            costPrice: purchase.costPrice,
            sellingPrice: purchase.sellingPrice,
            expiryDate: purchase.expiryDate,
            purchaseDate: purchase.purchaseDate,
            supplier: purchase.supplier,
          };

          const newPurchase: StockPurchase = {
            ...purchase,
            id: generateId(),
          };

          return {
            stockPurchases: [...state.stockPurchases, newPurchase],
            stockBatches: [...state.stockBatches, newBatch],
          };
        }),
    }),
    {
      name: 'pharmacy-storage',
    }
  )
);
