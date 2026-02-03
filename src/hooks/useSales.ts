import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export interface BatchDeduction {
  batch_id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  batch_deductions: BatchDeduction[] | null;
}

export interface ReturnItem {
  id: string;
  return_id: string;
  product_id: string;
  sale_item_id: string;
  quantity: number;
  batch_id: string | null;
  sale_item?: {
    unit_price: number;
    total: number;
    quantity: number;
    batch_deductions: BatchDeduction[] | null;
  };
}

export interface SalesReturn {
  id: string;
  sale_id: string;
  receipt_number: string;
  return_reason: string;
  returned_by: string | null;
  created_at: string;
  items?: ReturnItem[];
}

export interface Sale {
  id: string;
  receipt_number: string;
  total: number;
  payment_method: string;
  cashier_id: string | null;
  created_at: string;
  items?: SaleItem[];
}

export interface CartItem {
  product_id: string;
  product_name: string;
  strength: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  available_stock: number;
}

export function useSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Maximum number of records to fetch per query (pagination limit)
  const MAX_RECORDS_PER_QUERY = 1000;

  const fetchSales = useCallback(async () => {
    try {
      setError(null);
      // Optimize query - select only required fields
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          id, receipt_number, total, payment_method, cashier_id, created_at, discount,
          items:sale_items(id, sale_id, product_id, product_name, quantity, unit_price, total, batch_deductions)
        `)
        .order('created_at', { ascending: false })
        .limit(MAX_RECORDS_PER_QUERY);
      
      if (salesError) {
        throw salesError;
      }

      const { data: returnsData, error: returnsError } = await supabase
        .from('sales_returns')
        .select(`
          id, sale_id, receipt_number, return_reason, returned_by, created_at,
          items:return_items(
            id, return_id, product_id, sale_item_id, quantity, batch_id,
            sale_item:sale_items(unit_price, total, quantity, batch_deductions)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(MAX_RECORDS_PER_QUERY);

      if (returnsError) {
        console.error('Error fetching returns:', returnsError);
        // Don't block sales loading if returns fail, but maybe warn?
      }
      
      // Defensive null handling
      setSales(Array.isArray(salesData) ? salesData : []);
      setReturns(Array.isArray(returnsData) ? returnsData : []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sales';
      console.error('Error fetching sales:', err);
      setError(errorMessage);
      toast.error('Failed to load sales');
      setSales([]); // Set empty array on error
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const generateReceiptNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = date.getTime().toString().slice(-6);
    return `RCP-${dateStr}-${timeStr}`;
  };

  interface AvailableBatch {
    id: string;
    batch_number: string;
    quantity: number;
    expiry_date: string;
  }

  const processSale = async (
    items: CartItem[],
    paymentMethod: string,
    getAvailableBatches: (productId: string) => AvailableBatch[]
  ): Promise<{ success: boolean; error?: string; sale?: Sale }> => {
    try {
      // Validate stock and prepare batch deductions
      const itemsWithDeductions: Array<{
        product_id: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        total: number;
        batch_deductions: BatchDeduction[];
      }> = [];

      for (const item of items) {
        if (!item || !item.product_id || !item.product_name) {
          return {
            success: false,
            error: 'Invalid cart item',
          };
        }

        const availableBatches = getAvailableBatches(item.product_id);
        const totalAvailable = availableBatches.reduce((sum: number, b: AvailableBatch) => {
          return sum + (b?.quantity || 0);
        }, 0);

        if (totalAvailable < item.quantity) {
          return {
            success: false,
            error: `Insufficient stock for ${item.product_name}. Available: ${totalAvailable}`,
          };
        }

        // Calculate FEFO deductions
        let remainingQty = item.quantity;
        const deductions: BatchDeduction[] = [];

        for (const batch of availableBatches) {
          if (remainingQty <= 0 || !batch) break;

          const deductQty = Math.min(batch.quantity || 0, remainingQty);
          if (deductQty <= 0) continue;

          deductions.push({
            batch_id: batch.id,
            batch_number: batch.batch_number || '',
            quantity: deductQty,
            expiry_date: batch.expiry_date || '',
          });
          remainingQty -= deductQty;
        }

        itemsWithDeductions.push({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          batch_deductions: deductions,
        });
      }

      // Generate Receipt Number (HH-XXXXX)
      const { data: lastSale } = await supabase
        .from('sales')
        .select('receipt_number')
        .like('receipt_number', 'HH-%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNum = 1;
      if (lastSale?.receipt_number) {
        const parts = lastSale.receipt_number.split('-');
        if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
          nextNum = parseInt(parts[1]) + 1;
        }
      }
      const receiptNumber = `HH-${nextNum.toString().padStart(5, '0')}`;

      // Create sale record
      const total = items.reduce((sum, item) => sum + item.total, 0);

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          receipt_number: receiptNumber,
          total,
          payment_method: paymentMethod,
          cashier_id: user?.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = itemsWithDeductions.map((item) => ({
        sale_id: saleData.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        batch_deductions: item.batch_deductions,
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Optimize batch quantity updates - batch multiple updates together
      // Collect all batch updates first
      const batchUpdates: Array<{ id: string; quantity: number }> = [];
      const batchIdsToFetch = new Set<string>();
      
      for (const item of itemsWithDeductions) {
        for (const deduction of item.batch_deductions) {
          batchIdsToFetch.add(deduction.batch_id);
        }
      }

      // Fetch all current batch quantities in a single query
      if (batchIdsToFetch.size > 0) {
        const { data: currentBatches } = await supabase
          .from('stock_batches')
          .select('id, quantity')
          .in('id', Array.from(batchIdsToFetch));

        if (currentBatches) {
          const batchMap = new Map(currentBatches.map(b => [b.id, b.quantity]));
          
          // Calculate new quantities
          for (const item of itemsWithDeductions) {
            for (const deduction of item.batch_deductions) {
              const currentQty = batchMap.get(deduction.batch_id) || 0;
              const newQty = currentQty - deduction.quantity;
              batchUpdates.push({ id: deduction.batch_id, quantity: newQty });
            }
          }

          // Execute all updates in parallel using Promise.all
          await Promise.all(
            batchUpdates.map(update =>
              supabase
                .from('stock_batches')
                .update({ quantity: update.quantity })
                .eq('id', update.id)
            )
          );
        }
      }

      await fetchSales();
      
      if (!saleData) {
        return { success: false, error: 'Sale was not created' };
      }

      return { success: true, sale: saleData as Sale };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process sale';
      console.error('Error processing sale:', err);
      return { success: false, error: errorMessage };
    }
  };

  const getSaleByReceipt = async (receiptNumber: string | null | undefined) => {
    try {
      if (!receiptNumber || typeof receiptNumber !== 'string') {
        return null;
      }

      const { data, error: queryError } = await supabase
        .from('sales')
        .select(`
          *,
          items:sale_items(*),
          returns:sales_returns(
            items:return_items(*)
          )
        `)
        .eq('receipt_number', receiptNumber)
        .maybeSingle();

      if (queryError) {
        throw queryError;
      }
      return data || null;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch sale';
      console.error('Error fetching sale:', err);
      toast.error(errorMessage);
      return null;
    }
  };

  const processReturn = async (
    saleId: string,
    returnItems: { saleItemId: string; productId: string; quantity: number; batchId: string | null }[]
  ) => {
    try {
      // 1. Create Return Record
      const returnReceipt = `RET-${Date.now()}`;
      const { data: returnData, error: returnError } = await supabase
        .from('sales_returns')
        .insert({
          sale_id: saleId,
          receipt_number: returnReceipt,
          return_reason: 'Customer Return',
          returned_by: user?.id,
        })
        .select()
        .single();

      if (returnError) throw returnError;

      // 2. Create Return Items
      const itemsToInsert = returnItems.map(item => ({
        return_id: returnData.id,
        product_id: item.productId,
        sale_item_id: item.saleItemId,
        quantity: item.quantity,
        batch_id: item.batchId
      }));

      const { error: itemsError } = await supabase
        .from('return_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      await fetchSales();
      return { success: true };
    } catch (err: unknown) {
      console.error('Error processing return:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to process return' };
    }
  };

  // Memoize refetch function to prevent unnecessary re-renders
  const stableRefetch = useCallback(() => {
    return fetchSales();
  }, [fetchSales]);

  return {
    sales,
    returns,
    loading,
    error,
    processSale,
    getSaleByReceipt,
    processReturn,
    refetch: stableRefetch,
  };
}
