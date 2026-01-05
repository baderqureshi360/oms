import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPKR } from '@/lib/currency';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { usePharmacyStore } from '@/store/pharmacyStore';
import { Plus, PackagePlus, Package, Layers } from 'lucide-react';
import { format, parseISO, isBefore, addDays, startOfToday } from 'date-fns';
import { toast } from 'sonner';

export default function StockPurchases() {
  const { products, stockPurchases, stockBatches, addStockPurchase, getProductStock } = usePharmacyStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
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
  const selectedProduct = products.find((p) => p.id === formData.productId);

  const handleSubmit = (e: React.FormEvent) => {
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

    addStockPurchase({
      productId: formData.productId,
      productName: selectedProduct.name,
      batchNumber: formData.batchNumber.trim(),
      quantity,
      costPrice,
      sellingPrice,
      total: quantity * costPrice,
      supplier: formData.supplier || selectedProduct.supplier,
      expiryDate: formData.expiryDate,
      purchaseDate: new Date().toISOString(),
    });

    toast.success('Stock purchase recorded', {
      description: `Added ${quantity} units of ${selectedProduct.name} (Batch: ${formData.batchNumber})`,
    });

    setFormData({ productId: '', batchNumber: '', quantity: '', costPrice: '', sellingPrice: '', expiryDate: '', supplier: '' });
    setIsFormOpen(false);
  };

  const sortedPurchases = [...stockPurchases].sort(
    (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
  );

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
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="page-header mb-0">
            <h1 className="page-title">Stock Purchases</h1>
            <p className="page-subtitle">Record batch-wise inventory purchases with expiry tracking</p>
          </div>
          <Button onClick={() => setIsFormOpen(true)} className="shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Purchase
          </Button>
        </div>

        {/* Batch Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stockBatches.length}</p>
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
                  {stockBatches.filter(b => {
                    const expiry = parseISO(b.expiryDate);
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
                  {stockBatches.filter(b => b.quantity > 0 && isBefore(parseISO(b.expiryDate), today)).length}
                </p>
                <p className="text-sm text-muted-foreground">Expired Batches</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPurchases.map((purchase) => (
                <TableRow key={purchase.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-medium">{purchase.productName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">{purchase.batchNumber}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{purchase.supplier}</TableCell>
                  <TableCell className="text-right font-medium">{purchase.quantity}</TableCell>
                  <TableCell className="text-right">{formatPKR(purchase.costPrice)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{formatPKR(purchase.total)}</TableCell>
                  <TableCell>{getExpiryBadge(purchase.expiryDate)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(purchase.purchaseDate), 'MMM d, yyyy')}
                  </TableCell>
                </TableRow>
              ))}
              {sortedPurchases.length === 0 && (
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

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Stock Purchase</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product">Product</Label>
                <Select
                  value={formData.productId}
                  onValueChange={(value) => {
                    const product = products.find((p) => p.id === value);
                    setFormData({
                      ...formData,
                      productId: value,
                      costPrice: product?.costPrice.toString() || '',
                      sellingPrice: product?.price.toString() || '',
                      supplier: product?.supplier || '',
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} {product.strength && `(${product.strength})`} — Stock: {getProductStock(product.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batchNumber">Batch Number *</Label>
                  <Input
                    id="batchNumber"
                    value={formData.batchNumber}
                    onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                    placeholder="e.g., PCM-2024-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date *</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                  <Label htmlFor="sellingPrice">Sell (Rs.)</Label>
                  <Input
                    id="sellingPrice"
                    type="number"
                    step="0.01"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="Leave empty to use default supplier"
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

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Record Purchase</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
