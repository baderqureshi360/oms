import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StockBatch, Product } from '@/hooks/useProducts';
import { formatPKR } from '@/lib/currency';
import { format, parseISO } from 'date-fns';

type StockPurchaseItem = {
  batch: StockBatch;
  product?: Product;
};

interface StockPurchaseDetailsProps {
  batch: StockBatch | null;
  product: Product | undefined;
  items?: StockPurchaseItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockPurchaseDetails({ batch, product, items, open, onOpenChange }: StockPurchaseDetailsProps) {
  if (!batch) return null;

  const effectiveItems: StockPurchaseItem[] = Array.isArray(items) && items.length > 0
    ? items
    : [{ batch, product }];

  const totalAmount = effectiveItems.reduce((sum, item) => sum + (item.batch.quantity * item.batch.cost_price), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Purchase Details</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Purchase Information</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Purchase ID:</span>
              <span className="font-mono">{batch.id.substring(0, 8)}...</span>
              
              <span className="text-muted-foreground">Purchase Date:</span>
              <span>{format(parseISO(batch.purchase_date), 'MMM d, yyyy')}</span>
              
              <span className="text-muted-foreground">Total Amount:</span>
              <span className="font-bold text-primary">{formatPKR(totalAmount)}</span>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Supplier Information</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Supplier Name:</span>
              <span className="font-medium">{batch.supplier || 'N/A'}</span>
              
              <span className="text-muted-foreground">Contact:</span>
              <span>{batch.supplier_contact || 'N/A'}</span>
              
              <span className="text-muted-foreground">Address:</span>
              <span>{batch.supplier_address || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 mt-4">
          <h3 className="font-semibold text-lg border-b pb-2">Purchased Items</h3>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Batch No.</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Purchase Price</TableHead>
                  <TableHead className="text-right">Total Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {effectiveItems.map((item) => (
                  <TableRow key={item.batch.id}>
                    <TableCell className="font-medium">
                      {item.product?.name || item.batch.product_id || 'N/A'}
                      {item.product?.strength && <span className="text-muted-foreground ml-1">({item.product.strength})</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.batch.batch_number || 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">{item.batch.quantity}</TableCell>
                    <TableCell className="text-right">{formatPKR(item.batch.cost_price)}</TableCell>
                    <TableCell className="text-right font-bold">{formatPKR(item.batch.quantity * item.batch.cost_price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
