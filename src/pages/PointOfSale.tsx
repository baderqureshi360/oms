import { useState, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { BarcodeScanner } from '@/components/pos/BarcodeScanner';
import { CartItem } from '@/components/pos/CartItem';
import { ReceiptPrint } from '@/components/pos/ReceiptPrint';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePharmacyStore } from '@/store/pharmacyStore';
import { SaleItem } from '@/types/pharmacy';
import { formatPKR } from '@/lib/currency';
import { toast } from 'sonner';
import { CreditCard, Banknote, Smartphone, ShoppingBag, Trash2, Printer, Package, AlertTriangle, Percent, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { format, parseISO, isBefore, addDays, startOfToday } from 'date-fns';

export default function PointOfSale() {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<string>('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<'cash' | 'card' | 'mobile' | null>(null);
  const [lastSale, setLastSale] = useState<{ items: SaleItem[]; total: number; discount: number; finalTotal: number; paymentMethod: string; saleId: string } | null>(null);
  const [search, setSearch] = useState('');
  const receiptRef = useRef<HTMLDivElement>(null);
  const { getProductByBarcode, addSale, products, getProductStock, getAvailableBatches, getExpiringBatches } = usePharmacyStore();
  
  const today = startOfToday();
  const expiringBatches = getExpiringBatches(30);

  // Filter products by search term (name and salt_formula if available)
  const filteredProducts = Array.isArray(products) ? products.filter((product) => {
    if (!product || !product.id) return false;
    
    if (search && search.trim() !== '') {
      const searchLower = search.toLowerCase().trim();
      const matchesName = product.name?.toLowerCase().includes(searchLower) || false;
      // Check for salt_formula if it exists on the product (for database products)
      const matchesSaltFormula = (product as any).salt_formula?.toLowerCase().includes(searchLower) || false;
      
      if (!matchesName && !matchesSaltFormula) {
        return false;
      }
    }
    
    return true;
  }) : [];

  const handleScan = (barcode: string) => {
    const product = getProductByBarcode(barcode);
    
    if (!product) {
      toast.error('Product not found', {
        description: `No product with barcode ${barcode}`,
      });
      return;
    }

    const availableStock = getProductStock(product.id);
    
    if (availableStock <= 0) {
      toast.error('Out of stock', {
        description: `${product.name} is out of stock or expired`,
      });
      return;
    }

    const existingItem = cart.find((item) => item.productId === product.id);
    const currentQtyInCart = existingItem?.quantity || 0;
    
    if (currentQtyInCart >= availableStock) {
      toast.error('Insufficient stock', {
        description: `Only ${availableStock} units available (non-expired)`,
      });
      return;
    }
    
    // Get rack location if available
    const rackLocation = (product as any).rack?.name || (product as any).rackName || 'N/A';
    
    if (existingItem) {
      setCart(cart.map((item) =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
          : item
      ));
    } else {
      // Check if earliest batch is expiring soon (within 30 days)
      const batches = getAvailableBatches(product.id);
      if (batches.length > 0) {
        const earliestBatch = batches[0];
        const expiryDate = parseISO(earliestBatch.expiryDate);
        if (isBefore(expiryDate, addDays(today, 30))) {
          toast.warning(`Expiring soon!`, {
            description: `${product.name} batch expires on ${format(expiryDate, 'MMM d, yyyy')}`,
          });
        }
      }

      setCart([...cart, {
        productId: product.id,
        productName: `${product.name}${product.strength ? ` ${product.strength}` : ''}`,
        quantity: 1,
        unitPrice: product.price,
        total: product.price,
      }]);
    }

    // Show product details including rack location
    const productDetails = [
      `Product: ${product.name}${product.strength ? ` ${product.strength}` : ''}`,
      `Barcode: ${barcode}`,
      `Price: ${formatPKR(product.price)}`,
      `Quantity: ${availableStock}`,
      `Rack: ${rackLocation}`,
    ].join(' • ');

    toast.success('Added to cart', {
      description: productDetails,
      duration: 4000,
    });
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    const availableStock = getProductStock(productId);
    if (quantity > availableStock) {
      toast.error('Insufficient stock', {
        description: `Only ${availableStock} units available (non-expired)`,
      });
      return;
    }

    setCart(cart.map((item) =>
      item.productId === productId
        ? { ...item, quantity, total: quantity * item.unitPrice }
        : item
    ));
  };

  const handleRemoveItem = (productId: string) => {
    setCart(cart.filter((item) => item.productId !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
    setDiscountPercent('');
    toast.info('Cart cleared');
  };

  const handleFinalizeOrder = (paymentMethod: 'cash' | 'card' | 'mobile') => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    // Calculate totals with discount
    const subtotal = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (item?.total || 0), 0) : 0;
    const discountValue = discountPercent ? (subtotal * parseFloat(discountPercent) / 100) : 0;
    const finalTotal = subtotal - discountValue;

    const discountPercentNum = discountPercent ? parseFloat(discountPercent) : 0;
    const result = addSale(cart, paymentMethod, discountPercentNum);
    
    if (!result.success) {
      toast.error('Sale failed', {
        description: result.error,
      });
      setShowConfirmation(false);
      setPendingPaymentMethod(null);
      return;
    }
    
    setLastSale({
      items: [...cart],
      total: subtotal,
      discount: discountValue,
      finalTotal,
      paymentMethod,
      saleId: result.saleId?.toUpperCase() || '',
    });
    setShowReceipt(true);
    setShowConfirmation(false);
    setPendingPaymentMethod(null);
    setCart([]);
    setDiscountPercent('');
    
    toast.success('Sale completed!', {
      description: `Payment received via ${paymentMethod}. Stock deducted using FEFO.`,
    });
  };

  const handleCheckout = (paymentMethod: 'cash' | 'card' | 'mobile') => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setPendingPaymentMethod(paymentMethod);
    setShowConfirmation(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const subtotal = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (item?.total || 0), 0) : 0;
  const discountValue = discountPercent ? (subtotal * parseFloat(discountPercent) / 100) : 0;
  const finalTotal = subtotal - discountValue;
  const itemCount = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (item?.quantity || 0), 0) : 0;

  return (
    <MainLayout>
      <div className="p-6 lg:p-8 h-[calc(100vh-2rem)]">
        <div className="flex gap-6 h-full">
          {/* Products Grid */}
          <div className="flex-1 flex flex-col">
            <div className="page-header">
              <h1 className="page-title">Point of Sale</h1>
              <p className="page-subtitle">Scan barcode or select products • FEFO auto-deduction active</p>
            </div>

            {/* Expiring Soon Alert */}
            {expiringBatches.length > 0 && (
              <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-xl flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <p className="text-sm text-warning">
                  <strong>{expiringBatches.length} batch(es)</strong> expiring within 30 days. These will be sold first (FEFO).
                </p>
              </div>
            )}

            <div className="mb-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or salt/formula..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <BarcodeScanner onScan={handleScan} />
            </div>

            <div className="flex-1 overflow-auto pr-2">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map((product) => {
                  if (!product || !product.id) return null;
                  const stock = getProductStock(product.id);
                  const batches = getAvailableBatches(product.id);
                  const isLowStock = stock <= (product.minStock || 0);
                  const hasExpiringSoon = Array.isArray(batches) && batches.some(b => b && b.expiryDate && isBefore(parseISO(b.expiryDate), addDays(today, 30)));
                  
                  return (
                    <button
                      key={product.id}
                      onClick={() => product.barcode && handleScan(product.barcode)}
                      disabled={stock <= 0}
                      className="product-card text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none relative"
                    >
                      {hasExpiringSoon && stock > 0 && (
                        <div className="absolute -top-1 -right-1">
                          <span className="flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-warning"></span>
                          </span>
                        </div>
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          stock <= 0
                            ? 'bg-destructive/10 text-destructive'
                            : isLowStock 
                              ? 'bg-warning/15 text-warning' 
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {stock} left
                        </span>
                      </div>
                      <p className="font-semibold text-foreground truncate mb-0.5">{product.name}</p>
                      {product.strength && (
                        <p className="text-xs text-primary font-medium mb-1">{product.strength}</p>
                      )}
                      <p className="text-sm text-muted-foreground mb-1">{product.category}</p>
                      {(product as any).rack?.name && (
                        <p className="text-xs font-medium mb-2" style={{ color: (product as any).rack.color }}>
                          Rack: {(product as any).rack.name}
                        </p>
                      )}
                      <p className="price-tag">{formatPKR(product.price)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cart */}
          <div className="w-96 cart-panel flex flex-col">
            <div className="p-5 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Cart</h2>
                    <p className="text-sm text-muted-foreground">{itemCount} items</p>
                  </div>
                </div>
                {cart.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearCart}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <ShoppingBag className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="font-medium">Cart is empty</p>
                  <p className="text-sm">Scan a product to get started</p>
                </div>
              ) : (
                Array.isArray(cart) && cart.map((item) => {
                  if (!item || !item.productId) return null;
                  return (
                    <CartItem
                      key={item.productId}
                      item={item}
                      onUpdateQuantity={(qty) => handleUpdateQuantity(item.productId, qty)}
                      onRemove={() => handleRemoveItem(item.productId)}
                    />
                  );
                })
              )}
            </div>

            <div className="p-5 border-t border-border space-y-4 bg-muted/30">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-sm font-medium">{formatPKR(subtotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="discount" className="text-sm text-muted-foreground whitespace-nowrap">Discount (%)</Label>
                  <div className="relative flex-1">
                    <Percent className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="discount"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={discountPercent}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || (parseFloat(val) >= 0 && parseFloat(val) <= 100)) {
                          setDiscountPercent(val);
                        }
                      }}
                      placeholder="0"
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
                {discountValue > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-destructive font-medium">-{formatPKR(discountValue)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-lg font-semibold text-foreground">Total</span>
                  <span className="price-tag-large">{formatPKR(finalTotal)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Button
                  onClick={() => handleCheckout('cash')}
                  disabled={cart.length === 0}
                  className="btn-checkout bg-primary hover:bg-primary/90"
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs">Cash</span>
                </Button>
                <Button
                  onClick={() => handleCheckout('card')}
                  disabled={cart.length === 0}
                  className="btn-checkout bg-primary hover:bg-primary/90"
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-xs">Card</span>
                </Button>
                <Button
                  onClick={() => handleCheckout('mobile')}
                  disabled={cart.length === 0}
                  className="btn-checkout bg-primary hover:bg-primary/90"
                >
                  <Smartphone className="w-5 h-5" />
                  <span className="text-xs">JazzCash</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order</AlertDialogTitle>
            <AlertDialogDescription>
              Review your order before finalizing. This action will complete the sale and deduct stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-96 overflow-auto space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Items:</h4>
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.productId} className="flex justify-between items-start text-sm p-2 bg-muted/50 rounded">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium break-words">{item.productName}</p>
                      <p className="text-muted-foreground">Qty: {item.quantity} × {formatPKR(item.unitPrice)}</p>
                    </div>
                    <p className="font-semibold ml-4">{formatPKR(item.total)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>{formatPKR(subtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount ({discountPercent}%):</span>
                  <span className="text-destructive">-{formatPKR(discountValue)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold">Final Total:</span>
                <span className="text-lg font-bold text-primary">{formatPKR(finalTotal)}</span>
              </div>
              <div className="pt-2">
                <p className="text-sm text-muted-foreground">
                  Payment Method: <span className="capitalize font-medium">{pendingPaymentMethod}</span>
                </p>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowConfirmation(false);
              setPendingPaymentMethod(null);
            }}>
              Add More
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingPaymentMethod && handleFinalizeOrder(pendingPaymentMethod)}>
              Confirm Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-fit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Sale Receipt
            </DialogTitle>
          </DialogHeader>
          
          {lastSale && (
            <div className="flex flex-col items-center">
              <div className="print-receipt border border-border rounded-lg overflow-hidden">
                <ReceiptPrint
                  ref={receiptRef}
                  items={lastSale.items}
                  total={lastSale.total}
                  discount={lastSale.discount}
                  finalTotal={lastSale.finalTotal}
                  paymentMethod={lastSale.paymentMethod}
                  saleId={lastSale.saleId}
                />
              </div>
              
              <Button onClick={handlePrint} className="mt-4 w-full">
                <Printer className="w-4 h-4 mr-2" />
                Print Receipt
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
