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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Maximum number of records to fetch per query (pagination limit)
  const MAX_RECORDS_PER_QUERY = 1000;

  const fetchSales = useCallback(async () => {
    try {
      setError(null);
      const { data, error: queryError } = await supabase
        .from('sales')
        .select(`
          *,
          items:sale_items(*)
        `)
        .order('created_at', { ascending: false })
        .limit(MAX_RECORDS_PER_QUERY);
      
      if (queryError) {
        throw queryError;
      }
      
      // Defensive null handling
      setSales(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sales';
      console.error('Error fetching sales:', err);
      setError(errorMessage);
      toast.error('Failed to load sales');
      setSales([]); // Set empty array on error
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

      // Create sale record
      const receiptNumber = generateReceiptNumber();
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

      // Update batch quantities
      for (const item of itemsWithDeductions) {
        for (const deduction of item.batch_deductions) {
          const { data: currentBatch } = await supabase
            .from('stock_batches')
            .select('quantity')
            .eq('id', deduction.batch_id)
            .single();

          if (currentBatch) {
            await supabase
              .from('stock_batches')
              .update({ quantity: currentBatch.quantity - deduction.quantity })
              .eq('id', deduction.batch_id);
          }
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
          items:sale_items(*)
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

  return {
    sales,
    loading,
    error,
    processSale,
    getSaleByReceipt,
    refetch: fetchSales,
  };
}
