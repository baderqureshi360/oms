import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProductForm } from '@/components/products/ProductForm';
import { BarcodeScanner } from '@/components/pos/BarcodeScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPKR } from '@/lib/currency';
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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useProducts } from '@/hooks/useProducts';
import { useRacks } from '@/hooks/useRacks';
import { Product } from '@/types/pharmacy';
import { Plus, Search, Pencil, Trash2, Package, Layers, X } from 'lucide-react';
import { format, parseISO, isBefore, addDays, startOfToday } from 'date-fns';
import { toast } from 'sonner';

export default function Products() {
  const { products, batches, loading, addProduct, updateProduct, deleteProduct, getProductStock, getProductBatches, getProductByBarcode } = useProducts();
  const { racks } = useRacks();
  const [search, setSearch] = useState('');
  const [selectedRackId, setSelectedRackId] = useState<string>('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewBatchesId, setViewBatchesId] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');

  const handleBarcodeScan = (barcode: string) => {
    const product = getProductByBarcode(barcode);
    if (product) {
      // Product found - show details and allow edit
      setEditingProduct(product);
      setIsFormOpen(true);
      toast.success('Product found', {
        description: `${product.name} - Rack: ${product.rack?.name || 'N/A'}`,
      });
    } else {
      // Product not found - open form with barcode pre-filled
      setScannedBarcode(barcode);
      setIsFormOpen(true);
      toast.info('Product not found', {
        description: 'Creating new product with scanned barcode',
      });
    }
  };

  const today = startOfToday();

  // Filter products client-side for immediate UI updates
  // Server-side search is handled in fetchProducts when needed
  const filteredProducts = products.filter((product) => {
    if (!product) return false;
    
    // Apply rack filter
    if (selectedRackId && product.rack_id !== selectedRackId) {
      return false;
    }
    
    // Apply search filter
    if (search && search.trim() !== '') {
      const searchLower = search.toLowerCase().trim();
      const matchesName = product.name?.toLowerCase().includes(searchLower) || false;
      const matchesBarcode = product.barcode?.toLowerCase().includes(searchLower) || false;
      const matchesCategory = product.category?.toLowerCase().includes(searchLower) || false;
      const matchesSaltFormula = product.salt_formula?.toLowerCase().includes(searchLower) || false;
      
      if (!matchesName && !matchesBarcode && !matchesCategory && !matchesSaltFormula) {
        return false;
      }
    }
    
    return true;
  });

  const handleSubmit = async (data: Omit<Product, 'id' | 'createdAt'>) => {
    if (editingProduct) {
      const result = await updateProduct(editingProduct.id, data);
      if (result) {
        toast.success('Product updated successfully');
        setIsFormOpen(false);
        setEditingProduct(undefined);
      }
      // Error messages are already shown by updateProduct hook
    } else {
      const result = await addProduct(data);
      if (result) {
        toast.success('Product added successfully');
        setIsFormOpen(false);
        setEditingProduct(undefined);
        setScannedBarcode('');
      }
      // Error messages are already shown by addProduct hook - don't override with generic message
    }
  };

  const handleEdit = (product: Product) => {
    // Ensure rack_id is set when editing
    if (!product.rack_id && product.rack?.id) {
      product.rack_id = product.rack.id;
    }
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      const success = await deleteProduct(deleteId);
      if (success) {
        toast.success('Product deleted successfully');
        setDeleteId(null);
        // UI updates immediately via useProducts hook state management
      } else {
        toast.error('Failed to delete product. Please try again.');
      }
    }
  };

  const getStockBadge = (productId: string, minStock: number) => {
    const stock = getProductStock(productId);
    if (stock <= 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    }
    if (stock <= (minStock || 0)) {
      return <Badge className="bg-warning text-warning-foreground">Low: {stock}</Badge>;
    }
    return <Badge variant="secondary">{stock}</Badge>;
  };

  const viewingProduct = products.find(p => p.id === viewBatchesId);
  const viewingBatches = viewBatchesId ? getProductBatches(viewBatchesId) : [];

  return (
    <MainLayout>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="page-header mb-0">
            <h1 className="page-title">Products</h1>
            <p className="page-subtitle">Manage your medicine catalog • Stock tracked via batches</p>
          </div>
          <Button onClick={() => setIsFormOpen(true)} className="shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>

        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, salt/formula, barcode, or category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    // Support barcode scanner (Enter key)
                    if (e.key === 'Enter' && search.trim()) {
                      handleBarcodeScan(search.trim());
                    }
                  }}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2 min-w-[200px]">
                <Select 
                  value={selectedRackId || undefined} 
                  onValueChange={(value) => {
                    if (value && value.trim() !== '') {
                      setSelectedRackId(value);
                    } else {
                      setSelectedRackId('');
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by rack..." />
                  </SelectTrigger>
                  <SelectContent>
                    {racks
                      .filter(rack => rack && rack.id && rack.id.trim() !== '')
                      .map((rack) => (
                        <SelectItem key={rack.id} value={rack.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: rack.color || '#10b981' }}
                            />
                            {rack.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedRackId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setSelectedRackId('')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <BarcodeScanner onScan={handleBarcodeScan} />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="table-header">
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Rack</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-center">Batches</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => {
                const batches = getProductBatches(product.id);
                return (
                  <TableRow key={product.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground break-words">{product.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {product.strength && (
                              <span className="text-xs text-primary font-medium">{product.strength}</span>
                            )}
                            {product.dosage_form && (
                              <span className="text-xs text-muted-foreground">• {product.dosage_form}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{product.barcode || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{product.category || 'Uncategorized'}</Badge>
                    </TableCell>
                    <TableCell>
                      {product.rack ? (
                        <Badge 
                          variant="outline" 
                          style={{ 
                            borderColor: product.rack.color,
                            color: product.rack.color 
                          }}
                        >
                          {product.rack.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{getStockBadge(product.id, product.min_stock || 0)}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewBatchesId(product.id)}
                        className="hover:bg-primary/10 hover:text-primary"
                      >
                        <Layers className="w-4 h-4 mr-1" />
                        {batches.length}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(product)}
                          className="hover:bg-primary/10 hover:text-primary"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(product.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <Package className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground font-medium">No products found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add/Edit Product Dialog */}
        <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingProduct(undefined);
            setScannedBarcode('');
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            </DialogHeader>
            <ProductForm
              product={editingProduct || (scannedBarcode ? { barcode: scannedBarcode, name: '', rack_id: null, min_stock: 10 } as any : undefined)}
              onSubmit={async (data) => {
                await handleSubmit(data);
                setScannedBarcode('');
              }}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingProduct(undefined);
                setScannedBarcode('');
              }}
            />
          </DialogContent>
        </Dialog>

        {/* View Batches Dialog */}
        <Dialog open={!!viewBatchesId} onOpenChange={() => setViewBatchesId(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Batch Details — {viewingProduct?.name} {viewingProduct?.strength}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch No.</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingBatches.map((batch) => {
                    if (!batch || !batch.expiry_date) return null;
                    const expiryDate = parseISO(batch.expiry_date);
                    const isExpired = isBefore(expiryDate, today);
                    const isExpiringSoon = !isExpired && isBefore(expiryDate, addDays(today, 30));
                    
                    return (
                      <TableRow key={batch.id} className={isExpired ? 'opacity-50' : ''}>
                        <TableCell className="font-mono text-sm">{batch.batch_number || 'N/A'}</TableCell>
                        <TableCell className="text-right font-medium">{batch.quantity || 0}</TableCell>
                        <TableCell>{format(expiryDate, 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          {isExpired ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : isExpiringSoon ? (
                            <Badge className="bg-warning text-warning-foreground">Expiring Soon</Badge>
                          ) : (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {viewingBatches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No batches found. Add stock through Stock Purchases.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Product</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this product? This will also delete all associated batches. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
