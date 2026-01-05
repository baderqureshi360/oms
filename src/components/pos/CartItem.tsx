import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SaleItem } from '@/types/pharmacy';
import { formatPKR } from '@/lib/currency';

interface CartItemProps {
  item: SaleItem;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  return (
    <div className="flex items-center gap-4 p-4 bg-muted/40 rounded-xl border border-border/40 transition-all hover:bg-muted/60">
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-tight break-words whitespace-normal font-medium text-foreground">{item.productName}</p>
        <p className="text-sm text-muted-foreground mt-1">{formatPKR(item.unitPrice)} each</p>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => onUpdateQuantity(item.quantity - 1)}
          disabled={item.quantity <= 1}
        >
          <Minus className="w-4 h-4" />
        </Button>
        <span className="w-8 text-center font-semibold">{item.quantity}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => onUpdateQuantity(item.quantity + 1)}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="w-24 text-right font-bold text-primary">
        {formatPKR(item.total)}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
        onClick={onRemove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
