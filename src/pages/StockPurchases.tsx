import { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { UnifiedSearchBar } from '@/components/ui/UnifiedSearchBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPKR } from '@/lib/currency';
import { Badge } from '@/components/ui/badge';
import { Search, Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProducts, type Product, type StockBatch } from '@/hooks/useProducts';
import { useSales } from '@/hooks/useSales';
import { Plus, PackagePlus, Package, Layers, Pencil } from 'lucide-react';
import { format, parseISO, isBefore, addDays, startOfToday } from 'date-fns';
import { toast } from 'sonner';

export default function StockPurchases() {
  const { products, batches, getProductStock, addBatch, updateBatch } = useProducts();
  const { sales } = useSales();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<StockBatch | null>(null);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [tableSearch, setTableSearch] = useState('');
  const debouncedTableSearch = useDebounce(tableSearch, 300);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProductObj, setSelectedProductObj] = useState<Product | null>(null);

  const [formData, setFormData] = useState({
    productId: '',
    batchNumber: '',
    quantity: '',
    costPrice: '',
    sellingPrice: '',
    expiryDate: '',
    supplier: '',
  });

  const today = startOfToday();

  // Perform server-side search or use default products
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearch || debouncedSearch.trim() === '') {
        setSearchResults(products);
        return;
      }

      setIsSearching(true);
      try {
        const trimmedSearch = debouncedSearch.trim();
        const { data, error } = await supabase
          .from('products')
          .select('*, rack:racks(id, name, color)')
          .or(`name.ilike.%${trimmedSearch}%,salt_formula.ilike.%${trimmedSearch}%,barcode.eq.${trimmedSearch}`)
          .order('name');
        
        if (error) throw error;
        setSearchResults(data || []);
      } catch (err) {
        console.error('Search failed:', err);
        toast.error('Failed to search products');
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearch, products]);

  const handleEditClick = (batch: StockBatch) => {
    setEditingBatch(batch);
    setFormData({
      productId: batch.product_id,
      batchNumber: batch.batch_number,
      quantity: batch.quantity.toString(),
      costPrice: batch.cost_price.toString(),
      sellingPrice: batch.selling_price.toString(),
      expiryDate: batch.expiry_date,
      supplier: batch.supplier || '',
    });
    setSelectedProductObj(products.find(p => p.id === batch.product_id) || null);
    setIsFormOpen(true);
  };

  const selectedProduct = selectedProductObj || searchResults.find((p) => p.id === formData.productId) || products.find((p) => p.id === formData.productId);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }

    if (!formData.batchNumber.trim()) {
      toast.error('Batch number is required');
      return;
    }

    if (!formData.expiryDate) {
      toast.error('Expiry date is required');
      return;
    }

    const expiryDate = parseISO(formData.expiryDate);
    if (isBefore(expiryDate, today)) {
      toast.error('Cannot add expired stock');
      return;
    }

    const quantity = parseInt(formData.quantity);
    const costPrice = parseFloat(formData.costPrice);
    const sellingPrice = parseFloat(formData.sellingPrice);

    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Quantity must be a positive number');
      return;
    }

    if (isNaN(costPrice) || costPrice <= 0) {
      toast.error('Cost price must be a positive number');
      return;
    }

    if (isNaN(sellingPrice) || sellingPrice <= 0) {
      toast.error('Selling price must be a positive number');
      return;
    }

    if (editingBatch) {
      setPendingUpdate({
        product_id: formData.productId,
        quantity,
        cost_price: costPrice,
      });
      setShowUpdateConfirm(true);
      return;
    }

    const result = await addBatch({
      product_id: formData.productId,
      batch_number: formData.batchNumber.trim(),
      quantity,
      cost_price: costPrice,
      selling_price: sellingPrice,
      expiry_date: formData.expiryDate,
      purchase_date: new Date().toISOString().split('T')[0],
      supplier: formData.supplier || null,
    });

    if (result) {
      toast.success('Stock purchase recorded', {
        description: `Added ${quantity} units of ${selectedProduct.name} (Batch: ${formData.batchNumber})`,
      });

      setFormData({ productId: '', batchNumber: '', quantity: '', costPrice: '', sellingPrice: '', expiryDate: '', supplier: '' });
      setSelectedProductObj(null);
      setIsFormOpen(false);
    }
  };

  const handleConfirmUpdate = async () => {
    if (!editingBatch || !pendingUpdate) return;
    
    const result = await updateBatch(editingBatch.id, pendingUpdate);

    if (result) {
      setFormData({ productId: '', batchNumber: '', quantity: '', costPrice: '', sellingPrice: '', expiryDate: '', supplier: '' });
      setSelectedProductObj(null);
      setEditingBatch(null);
      setIsFormOpen(false);
    }
    setShowUpdateConfirm(false);
    setPendingUpdate(null);
  };

  // Sort batches by purchase date (most recent first)
  const sortedBatches = [...batches].sort(
    (a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime()
  );

  const filteredBatches = useMemo(() => {
    if (!debouncedTableSearch) return sortedBatches;
    const searchLower = debouncedTableSearch.toLowerCase().trim();
    const isNumeric = /^\d+$/.test(searchLower);
    
    return sortedBatches.filter((batch) => {
       const product = products.find(p => p.id === batch.product_id);
       if (isNumeric) {
         return product?.barcode?.toLowerCase().includes(searchLower) || false;
       } else {
         return product?.name?.toLowerCase().includes(searchLower) || false;
       }
    });
  }, [sortedBatches, debouncedTableSearch, products]);

  const getExpiryBadge = (expiryDate: string) => {
    const expiry = parseISO(expiryDate);
    const isExpired = isBefore(expiry, today);
    const isExpiringSoon = isBefore(expiry, addDays(today, 30));

    if (isExpired) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (isExpiringSoon) {
      return <Badge className="bg-warning text-warning-foreground">{format(expiry, 'MMM d, yyyy')}</Badge>;
    }
    return <span className="text-muted-foreground">{format(expiry, 'MMM d, yyyy')}</span>;
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="page-header mb-0">
            <h1 className="page-title text-2xl sm:text-3xl">Stock Purchases</h1>
            <p className="page-subtitle text-sm sm:text-base">Record batch-wise inventory purchases with expiry tracking</p>
          </div>
          <Button onClick={() => {
            setEditingBatch(null);
            setFormData({ productId: '', batchNumber: '', quantity: '', costPrice: '', sellingPrice: '', expiryDate: '', supplier: '' });
            setSelectedProductObj(null);
            setIsFormOpen(true);
          }} className="shadow-sm w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Add Purchase
          </Button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
           <UnifiedSearchBar
              value={tableSearch}
              onChange={setTableSearch}
              placeholder="Search batches by product name or barcode..."
              autoFocus={false}
            />
        </div>

        {/* Batch Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 sm:mb-6">
          <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{batches.length}</p>
                <p className="text-sm text-muted-foreground">Total Batches</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center">
                <Package className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {batches.filter(b => {
                    const expiry = parseISO(b.expiry_date);
                    return b.quantity > 0 && !isBefore(expiry, today) && isBefore(expiry, addDays(today, 30));
                  }).length}
                </p>
                <p className="text-sm text-muted-foreground">Expiring in 30 days</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center">
                <Package className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {batches.filter(b => b.quantity > 0 && isBefore(parseISO(b.expiry_date), today)).length}
                </p>
                <p className="text-sm text-muted-foreground">Expired Batches</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow className="table-header">
                <TableHead>Product</TableHead>
                <TableHead>Batch No.</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBatches.map((batch) => {
                const product = products.find(p => p.id === batch.product_id);
                return (
                  <TableRow key={batch.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <span className="font-medium">{product?.name || 'Unknown Product'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{batch.batch_number}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{batch.supplier || 'N/A'}</TableCell>
                    <TableCell className="text-right font-medium">{batch.quantity}</TableCell>
                    <TableCell className="text-right">{formatPKR(batch.cost_price)}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{formatPKR(batch.quantity * batch.cost_price)}</TableCell>
                    <TableCell>{getExpiryBadge(batch.expiry_date)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(batch.purchase_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(batch)}
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredBatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <PackagePlus className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground font-medium">No stock purchases recorded yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Click "Add Purchase" to record your first purchase</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </div>

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-lg w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBatch ? 'Edit Stock Purchase' : 'Record Stock Purchase'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product">Product</Label>
                <div className="space-y-2">
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button
                         variant="outline"
                         role="combobox"
                         aria-expanded={open}
                         className="w-full justify-between"
                       >
                         {selectedProduct
                           ? selectedProduct.name
                           : "Select product..."}
                         <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                       </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Search by name, barcode, or salt/formula..." 
                          value={search}
                          onValueChange={setSearch}
                        />
                        <CommandList>
                          {isSearching ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
                          ) : searchResults.length === 0 ? (
                            <CommandEmpty>No product found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {searchResults.map((product) => (
                                <CommandItem
                                  key={product.id}
                                  value={product.name}
                                  onSelect={() => {
                                    const value = product.id;
                                    // Get latest batch price if available, otherwise leave empty
                                    // If editing, we probably don't want to overwrite the price unless the user wants to
                                    // But if they select a new product, maybe we should?
                                    // For now, I'll stick to existing behavior which is setting price from latest batch
                                    // But if editing, maybe we should keep the current price if valid?
                                    // Actually if I change product, the price is likely different.
                                    
                                    const latestBatch = batches
                                      .filter(b => b.product_id === value)
                                      .sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime())[0];
                                    
                                    setSelectedProductObj(product);
                                    setFormData({
                                      ...formData,
                                      productId: value,
                                      // If we are editing, we might want to keep the current price if we are just correcting the product
                                      // But if we are changing the product entirely, maybe we want the default price.
                                      // Let's stick to default behavior for now.
                                      costPrice: latestBatch?.cost_price.toString() || '',
                                      sellingPrice: latestBatch?.selling_price.toString() || '',
                                      supplier: latestBatch?.supplier || '',
                                    });
                                    setOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.productId === product.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{product.name} {product.strength && `(${product.strength})`}</span>
                                    <span className="text-xs text-muted-foreground">Stock: {getProductStock(product.id)}</span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batchNumber">Batch Number {editingBatch ? '(Read-only)' : '*'}</Label>
                  <Input
                    id="batchNumber"
                    value={formData.batchNumber}
                    onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                    placeholder="e.g., PCM-2024-001"
                    required
                    readOnly={!!editingBatch}
                    className={editingBatch ? "bg-muted" : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date {editingBatch ? '(Read-only)' : '*'}</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    required
                    readOnly={!!editingBatch}
                    className={editingBatch ? "bg-muted" : ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="costPrice">Cost (Rs.)</Label>
                  <Input
                    id="costPrice"
                    type="number"
                    step="0.01"
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sellingPrice">Sell (Rs.) {editingBatch ? '(Read-only)' : ''}</Label>
                  <Input
                    id="sellingPrice"
                    type="number"
                    step="0.01"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    required
                    readOnly={!!editingBatch}
                    className={editingBatch ? "bg-muted" : ""}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier {editingBatch ? '(Read-only)' : ''}</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="Leave empty to use default supplier"
                  readOnly={!!editingBatch}
                  className={editingBatch ? "bg-muted" : ""}
                />
              </div>

              {formData.quantity && formData.costPrice && (
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-medium">Total Cost</span>
                    <span className="text-xl font-bold text-primary">
                      {formatPKR(parseInt(formData.quantity) * parseFloat(formData.costPrice))}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" className="w-full sm:w-auto">
                  {editingBatch ? 'Update Purchase' : 'Record Purchase'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showUpdateConfirm} onOpenChange={setShowUpdateConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Stock Purchase?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to update this stock purchase? This will modify the inventory levels and cost calculations.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowUpdateConfirm(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmUpdate}>Update</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
