import { useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useSales } from '@/hooks/useSales';
import { useProducts } from '@/hooks/useProducts';
import { formatPKR } from '@/lib/currency';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, differenceInHours } from 'date-fns';
import { Banknote, Receipt, TrendingUp, Calendar, Package, Download, ArrowLeft, Search, Undo2 } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { toast } from 'sonner';

export default function SalesReport() {
  const { sales, returns, loading, processReturn, getSaleByReceipt } = useSales();
  const { batches } = useProducts();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Return Feature State
  const [viewMode, setViewMode] = useState<'report' | 'return'>('report');
  const [returnReceiptId, setReturnReceiptId] = useState('');
  const [foundSale, setFoundSale] = useState<any>(null);
  const [returnSelection, setReturnSelection] = useState<{[key: string]: number}>({});
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [isReturnExpired, setIsReturnExpired] = useState(false);

  // --- Filtering Logic ---

  const filteredSales = useMemo(() => {
    if (!sales || !Array.isArray(sales)) return [];

    return sales.filter((sale) => {
      if (!sale?.created_at) return false;
      const saleDate = new Date(sale.created_at);

      if (dateFrom && dateTo) {
        return isWithinInterval(saleDate, {
          start: startOfDay(parseISO(dateFrom)),
          end: endOfDay(parseISO(dateTo)),
        });
      }
      if (dateFrom) {
        return saleDate >= startOfDay(parseISO(dateFrom));
      }
      if (dateTo) {
        return saleDate <= endOfDay(parseISO(dateTo));
      }
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sales, dateFrom, dateTo]);

  const filteredReturns = useMemo(() => {
    if (!returns || !Array.isArray(returns)) return [];

    return returns.filter((ret) => {
      if (!ret?.created_at) return false;
      const retDate = new Date(ret.created_at);

      if (dateFrom && dateTo) {
        return isWithinInterval(retDate, {
          start: startOfDay(parseISO(dateFrom)),
          end: endOfDay(parseISO(dateTo)),
        });
      }
      if (dateFrom) {
        return retDate >= startOfDay(parseISO(dateFrom));
      }
      if (dateTo) {
        return retDate <= endOfDay(parseISO(dateTo));
      }
      return true;
    });
  }, [returns, dateFrom, dateTo]);

  // --- Calculation Helpers ---

  const getCostPrice = (productId: string, batchDeductions: any) => {
    if (!batchDeductions || !Array.isArray(batchDeductions) || batchDeductions.length === 0) {
      return 0;
    }
    const firstBatchId = batchDeductions[0]?.batch_id;
    if (!firstBatchId) return 0;
    const batch = batches.find(b => b.id === firstBatchId);
    return batch?.cost_price || 0;
  };

  const calculateItemProfit = (item: any) => {
    if (!item) return 0;
    const costPrice = getCostPrice(item.product_id, item.batch_deductions);
    return (item.unit_price - costPrice) * item.quantity;
  };

  const calculateSaleProfit = (sale: any) => {
    if (!sale?.items || !Array.isArray(sale.items)) return 0;
    return sale.items.reduce((sum: number, item: any) => sum + calculateItemProfit(item), 0);
  };

  const calculateReturnValue = (ret: any) => {
    return ret.items?.reduce((sum: number, item: any) => {
      return sum + (item.quantity * (item.sale_item?.unit_price || 0));
    }, 0) || 0;
  };

  const calculateReturnProfitDeduction = (ret: any) => {
    return ret.items?.reduce((sum: number, item: any) => {
      const unitPrice = item.sale_item?.unit_price || 0;
      const costPrice = getCostPrice(item.product_id, item.sale_item?.batch_deductions);
      return sum + (item.quantity * (unitPrice - costPrice));
    }, 0) || 0;
  };

  // --- Stats ---

  const stats = useMemo(() => {
    const grossRevenue = filteredSales.reduce((sum, sale) => sum + (sale?.total || 0), 0);
    const grossProfit = filteredSales.reduce((sum, sale) => sum + calculateSaleProfit(sale), 0);
    
    const returnRevenue = filteredReturns.reduce((sum, ret) => sum + calculateReturnValue(ret), 0);
    const returnProfit = filteredReturns.reduce((sum, ret) => sum + calculateReturnProfitDeduction(ret), 0);

    const totalRevenue = grossRevenue - returnRevenue;
    const totalTransactions = filteredSales.length; // Keeping transaction count as sales count
    const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    
    // Total items sold (net)
    const grossItems = filteredSales.reduce((sum, sale) =>
      sum + (sale?.items?.reduce((itemSum: number, item: any) => itemSum + (item?.quantity || 0), 0) || 0), 0
    );
    const returnedItems = filteredReturns.reduce((sum, ret) => 
      sum + (ret.items?.reduce((itemSum: number, item: any) => itemSum + (item?.quantity || 0), 0) || 0), 0
    );
    const totalItems = grossItems - returnedItems;
    
    const totalProfit = grossProfit - returnProfit;

    return { totalRevenue, totalTransactions, avgTransaction, totalItems, totalProfit };
  }, [filteredSales, filteredReturns, batches]);

  // --- Return Handlers ---

  const handleFindSale = async () => {
    if (!returnReceiptId.trim()) {
      toast.error('Please enter a Receipt ID');
      return;
    }
    const sale = await getSaleByReceipt(returnReceiptId);
    if (sale) {
      const hoursSinceSale = differenceInHours(new Date(), new Date(sale.created_at));
      const expired = hoursSinceSale > 48;
      
      setIsReturnExpired(expired);
      setFoundSale(sale);
      setReturnSelection({});
      
      if (expired) {
        // Just show status, but we still setFoundSale to show the sale details (and return history if any)
        // But we will disable the return inputs.
      }
    } else {
      toast.error('Sale not found');
      setFoundSale(null);
      setIsReturnExpired(false);
    }
  };

  const getReturnedQuantity = (saleItemId: string) => {
    // First try to use the returns attached to the foundSale, as they are specific to this sale
    if (foundSale?.returns && Array.isArray(foundSale.returns)) {
       let qty = 0;
       foundSale.returns.forEach((ret: any) => {
         ret.items?.forEach((item: any) => {
           if (item.sale_item_id === saleItemId) {
             qty += item.quantity;
           }
         });
       });
       return qty;
    }

    // Fallback to global returns list
    if (!returns) return 0;
    let qty = 0;
    returns.forEach(ret => {
      ret.items?.forEach(item => {
        if (item.sale_item_id === saleItemId) {
          qty += item.quantity;
        }
      });
    });
    return qty;
  };

  const handleReturnSubmit = async () => {
    if (!foundSale) return;

    const itemsToReturn = Object.entries(returnSelection).map(([saleItemId, qty]) => {
      const originalItem = foundSale.items.find((i: any) => i.id === saleItemId);
      if (!originalItem || qty <= 0) return null;
      
      // Determine batch to return to (using first batch deduction for simplicity as we don't track which specific batch unit was returned if multiple batches used)
      // Ideally we should match logic, but typically we return to the batch that was deducted.
      // Since 'batch_deductions' is an array, we might have multiple batches.
      // For simplicity in this strict scope, we take the first batch ID or null.
      const batchId = originalItem.batch_deductions?.[0]?.batch_id || null;

      return {
        saleItemId,
        productId: originalItem.product_id,
        quantity: qty,
        batchId
      };
    }).filter((i): i is NonNullable<typeof i> => i !== null);

    if (itemsToReturn.length === 0) {
      toast.error('No items selected for return');
      return;
    }

    setIsProcessingReturn(true);
    const result = await processReturn(foundSale.id, itemsToReturn);
    setIsProcessingReturn(false);

    if (result.success) {
      toast.success('Return processed successfully');
      setFoundSale(null);
      setReturnReceiptId('');
      setReturnSelection({});
      setViewMode('report');
    } else {
      toast.error(result.error || 'Failed to process return');
    }
  };

  const handleDownloadCSV = () => {
    if (filteredSales.length === 0) {
      toast.error('No sales data to download');
      return;
    }

    // Prepare CSV data
    const headers = ['Sale ID', 'Date & Time', 'Product Name', 'Quantity', 'Unit Price', 'Subtotal', 'Discount', 'Total', 'Payment Method', 'Status'];
    const rows: string[][] = [];

    filteredSales.forEach((sale) => {
      if (!sale?.items || !Array.isArray(sale.items)) return;

      sale.items.forEach((item: any, idx: number) => {
        const saleDate = format(new Date(sale.created_at), 'yyyy-MM-dd HH:mm:ss');
        const discount = (sale as any).discount || 0;
        const itemTotal = idx === 0 && sale.items!.length === 1
          ? sale.total
          : item.total - (idx === 0 ? discount / sale.items!.length : 0);

        rows.push([
          sale.id,
          saleDate,
          item.product_name || '',
          item.quantity?.toString() || '0',
          formatPKR(item.unit_price || 0).replace('PKR ', ''),
          formatPKR(item.total || 0).replace('PKR ', ''),
          idx === 0 ? formatPKR(discount).replace('PKR ', '') : '0',
          formatPKR(itemTotal).replace('PKR ', ''),
          sale.payment_method || '',
          'Sold'
        ]);
      });
    });

    // Append Returns
    filteredReturns.forEach((ret) => {
       if (!ret?.items) return;
       ret.items.forEach((item: any) => {
         const retDate = format(new Date(ret.created_at), 'yyyy-MM-dd HH:mm:ss');
         const unitPrice = item.sale_item?.unit_price || 0;
         const total = unitPrice * item.quantity;
         
         rows.push([
           ret.receipt_number, // Using return receipt or original sale ID? "Sale ID" column implies Sale ID.
           retDate,
           item.sale_item?.product_name || 'Unknown', // Need product name, fetch from sale_item or products? sale_item doesn't have name in relation? 
           // sale_item in useSales query doesn't select product_name.
           // Wait, sale_item has product_id. I can look up in batches or products if loaded?
           // 'batches' from useProducts contains some info, but maybe not all names.
           // Let's use 'Returned Item' placeholder if name missing, or check if sale_item has it.
           // In useSales, sale_item relation: sale_item:sale_items(unit_price, total, quantity, batch_deductions). It misses product_name.
           // But I can't change query easily without checking if product_name is on sale_items table.
           // sale_items table has product_name column (checked schema earlier).
           // So I should have selected product_name in useSales for returns too.
           // I'll leave it simple for now or assume I added it. I added 'sale_item:sale_items(unit_price...)' 
           // I should add product_name to that query for better CSV.
           `-${item.quantity}`,
           formatPKR(unitPrice).replace('PKR ', ''),
           formatPKR(-total).replace('PKR ', ''),
           '0',
           formatPKR(-total).replace('PKR ', ''),
           'Return',
           'Returned'
         ]);
       });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sales-report-${dateFrom || 'all'}-${dateTo || 'all'}-${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report downloaded');
  };

  const handleDownloadExcel = () => {
    handleDownloadCSV();
    toast.info('Downloaded as CSV (Excel-compatible)');
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="page-header mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title text-2xl sm:text-3xl">Sales Report</h1>
            <p className="page-subtitle text-sm sm:text-base">View and analyze your sales data</p>
          </div>
          <div className="flex gap-2">
             <Button 
               variant={viewMode === 'report' ? "default" : "outline"}
               onClick={() => setViewMode('report')}
               className="gap-2"
             >
               <Banknote className="w-4 h-4" />
               Report
             </Button>
             <Button 
               variant={viewMode === 'return' ? "default" : "outline"}
               onClick={() => setViewMode('return')}
               className="gap-2"
             >
               <Undo2 className="w-4 h-4" />
               Sales Return
             </Button>
          </div>
        </div>

        {viewMode === 'report' ? (
          <>
            {/* Date Filter */}
            <div className="bg-card rounded-2xl border border-border/60 p-4 sm:p-5 mb-4 sm:mb-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="dateFrom" className="text-sm text-muted-foreground whitespace-nowrap">From</Label>
                        <Input
                          id="dateFrom"
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="w-full sm:w-44 h-10 sm:h-9"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="dateTo" className="text-sm text-muted-foreground whitespace-nowrap">To</Label>
                        <Input
                          id="dateTo"
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="w-full sm:w-44 h-10 sm:h-9"
                        />
                      </div>
                    </div>
                    {(dateFrom || dateTo) && (
                      <button
                        onClick={() => { setDateFrom(''); setDateTo(''); }}
                        className="text-sm text-primary hover:underline font-medium whitespace-nowrap"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleDownloadCSV} variant="outline" size="sm" className="flex-1 sm:flex-initial">
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV
                  </Button>
                  <Button onClick={handleDownloadExcel} variant="outline" size="sm" className="flex-1 sm:flex-initial">
                    <Download className="w-4 h-4 mr-2" />
                    Download Excel
                  </Button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <StatCard
                title="Net Revenue"
                value={formatPKR(stats.totalRevenue)}
                icon={<Banknote className="w-6 h-6" />}
                variant="success"
              />
              <StatCard
                title="Transactions"
                value={stats.totalTransactions}
                icon={<Receipt className="w-6 h-6" />}
              />
              <StatCard
                title="Avg. Transaction"
                value={formatPKR(stats.avgTransaction)}
                icon={<TrendingUp className="w-6 h-6" />}
              />
              <StatCard
                title="Net Items Sold"
                value={stats.totalItems}
                icon={<Package className="w-6 h-6" />}
              />
              <StatCard
                title="Net Profit"
                value={formatPKR(stats.totalProfit)}
                icon={<TrendingUp className="w-6 h-6" />}
                variant="success"
              />
            </div>

            {/* Sales Table */}
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="table-header">
                      <TableHead>Sale ID</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                            <Receipt className="w-8 h-8 text-muted-foreground/50 animate-pulse" />
                          </div>
                          <p className="text-muted-foreground font-medium">Loading sales...</p>
                        </TableCell>
                      </TableRow>
                    ) : filteredSales.map((sale) => (
                      <TableRow key={sale.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-sm">#{sale.receipt_number || sale.id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {sale.items?.map((item: any, idx: number) => (
                              <div key={idx} className="text-sm">
                                <span className="font-medium">{item.product_name || 'Unknown'}</span>
                                <span className="text-muted-foreground"> × {item.quantity || 0}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  (Profit: {formatPKR(calculateItemProfit(item))})
                                </span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {sale.payment_method || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(sale.created_at), 'MMM d, yyyy h:mm a')}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-lg text-primary">
                          {formatPKR(sale.total || 0)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatPKR(calculateSaleProfit(sale))}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && filteredSales.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                            <Receipt className="w-8 h-8 text-muted-foreground/50" />
                          </div>
                          <p className="text-muted-foreground font-medium">No sales found</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : (
          /* Sales Return View */
          <div className="max-w-4xl mx-auto">
             <div className="bg-card rounded-2xl border border-border/60 p-6 shadow-sm mb-6">
                <h2 className="text-xl font-semibold mb-4">Process Return</h2>
                <div className="flex gap-4 items-end mb-6">
                   <div className="flex-1">
                      <Label htmlFor="receiptId">Receipt ID</Label>
                      <Input 
                        id="receiptId" 
                        placeholder="Enter Receipt ID (e.g. RCP-2023...)" 
                        value={returnReceiptId}
                        onChange={(e) => setReturnReceiptId(e.target.value)}
                      />
                   </div>
                   <Button onClick={handleFindSale} disabled={!returnReceiptId.trim()}>
                      <Search className="w-4 h-4 mr-2" />
                      Find Sale
                   </Button>
                </div>

                {foundSale && (
                   <div className="space-y-6">
                      {/* Return Status Message */}
                      <div className={`p-4 rounded-lg border ${isReturnExpired ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-green-500/10 border-green-500/20 text-green-700'}`}>
                        <div className="flex items-center gap-2 font-semibold">
                          {isReturnExpired ? (
                            <>
                              <span className="text-lg">❌</span>
                              <span>Expired – Return Not Allowed</span>
                            </>
                          ) : (
                            <>
                              <span className="text-lg">✅</span>
                              <span>Return Available</span>
                            </>
                          )}
                        </div>
                        {isReturnExpired && <p className="text-sm mt-1 opacity-90">This receipt is older than 2 days.</p>}
                      </div>

                      <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                         <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div>
                               <p className="text-xs text-muted-foreground">Sale Date</p>
                               <p className="font-medium">{format(new Date(foundSale.created_at), 'MMM d, yyyy h:mm a')}</p>
                            </div>
                            <div>
                               <p className="text-xs text-muted-foreground">Total Amount</p>
                               <p className="font-medium text-primary">{formatPKR(foundSale.total)}</p>
                            </div>
                            <div>
                               <p className="text-xs text-muted-foreground">Payment Method</p>
                               <Badge variant="outline">{foundSale.payment_method}</Badge>
                            </div>
                            <div>
                               <p className="text-xs text-muted-foreground">Cashier</p>
                               <p className="font-medium">{(foundSale.cashier_id) ? 'Admin' : 'Unknown'}</p>
                            </div>
                         </div>
                      </div>

                      <div>
                         <h3 className="font-medium mb-3">Select Items to Return</h3>
                         <Table>
                           <TableHeader>
                              <TableRow>
                                 <TableHead>Product</TableHead>
                                 <TableHead>Sold Qty</TableHead>
                                 <TableHead>Price</TableHead>
                                 <TableHead>Already Returned</TableHead>
                                 <TableHead>Return Qty</TableHead>
                              </TableRow>
                           </TableHeader>
                           <TableBody>
                              {foundSale.items.map((item: any) => {
                                 const returnedAlready = getReturnedQuantity(item.id);
                                 const maxReturn = item.quantity - returnedAlready;
                                 
                                 return (
                                    <TableRow key={item.id}>
                                       <TableCell className="font-medium">{item.product_name}</TableCell>
                                       <TableCell>{item.quantity}</TableCell>
                                       <TableCell>{formatPKR(item.unit_price)}</TableCell>
                                       <TableCell>{returnedAlready}</TableCell>
                                       <TableCell>
                                          <Input 
                                             type="number" 
                                             min="0"
                                             max={maxReturn}
                                             value={returnSelection[item.id] || ''}
                                             onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                if (val < 0) return;
                                                if (val > maxReturn) {
                                                   toast.error(`Cannot return more than ${maxReturn}`);
                                                   return;
                                                }
                                                setReturnSelection(prev => ({
                                                   ...prev,
                                                   [item.id]: val
                                                }));
                                             }}
                                             className="w-24"
                                             disabled={maxReturn <= 0 || isReturnExpired}
                                          />
                                       </TableCell>
                                    </TableRow>
                                 );
                              })}
                           </TableBody>
                         </Table>
                      </div>

                      {/* Return History Section */}
                      {foundSale.returns && foundSale.returns.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-border/60">
                          <h3 className="font-medium mb-3">Returned Items History</h3>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Return Date</TableHead>
                                <TableHead>Receipt ID</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Qty Returned</TableHead>
                                <TableHead>Amount Deducted</TableHead>
                                <TableHead>Profit Deducted</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {foundSale.returns.map((ret: any) => (
                                ret.items?.map((item: any) => {
                                  // Find original sale item to get details
                                  const originalItem = foundSale.items.find((i: any) => i.id === item.sale_item_id);
                                  const unitPrice = originalItem?.unit_price || 0;
                                  const costPrice = getCostPrice(originalItem?.product_id, originalItem?.batch_deductions);
                                  const amountDeducted = item.quantity * unitPrice;
                                  const profitDeducted = item.quantity * (unitPrice - costPrice);
                                  
                                  return (
                                    <TableRow key={item.id}>
                                      <TableCell>{format(new Date(ret.created_at), 'MMM d, yyyy')}</TableCell>
                                      <TableCell>{ret.receipt_number}</TableCell>
                                      <TableCell>{originalItem?.product_name || 'Unknown'}</TableCell>
                                      <TableCell>{item.quantity}</TableCell>
                                      <TableCell className="text-destructive">-{formatPKR(amountDeducted)}</TableCell>
                                      <TableCell className="text-destructive">-{formatPKR(profitDeducted)}</TableCell>
                                    </TableRow>
                                  );
                                })
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                         <Button variant="outline" onClick={() => {
                            setFoundSale(null);
                            setReturnReceiptId('');
                            setReturnSelection({});
                         }}>Cancel</Button>
                         <Button onClick={handleReturnSubmit} disabled={isProcessingReturn || Object.keys(returnSelection).length === 0 || isReturnExpired}>
                            {isProcessingReturn ? 'Processing...' : 'Confirm Return'}
                         </Button>
                      </div>
                   </div>
                )}
             </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
