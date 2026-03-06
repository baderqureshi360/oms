import { memo } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPKR } from '@/lib/currency';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface CartItemData {
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  sellingUnit?: 'box' | 'strip';
  canChooseUnit?: boolean;
}

interface CartItemProps {
  item: CartItemData;
  onUpdateQuantity: (quantity: number) => void;
  onChangeUnit?: (unit: 'box' | 'strip') => void;
  onRemove: () => void;
  isSelected?: boolean;
  onClick?: () => void;
}

export const CartItem = memo(function CartItem({ item, onUpdateQuantity, onChangeUnit, onRemove, isSelected, onClick }: CartItemProps) {
  return (
    <div 
      className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border transition-all hover:bg-muted/60 cursor-pointer ${
        isSelected 
          ? 'bg-primary/10 border-primary ring-1 ring-primary' 
          : 'bg-muted/40 border-border/40'
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 w-full sm:w-auto">
        <p className="text-sm leading-normal break-words whitespace-normal font-medium text-foreground">
          {item.productName}
          {item.sellingUnit && (
            <span className="text-muted-foreground ml-1">({item.sellingUnit === 'box' ? 'Box' : 'Strip'})</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{formatPKR(item.unitPrice)} each</p>
        {item.canChooseUnit && (
          <div className="mt-2">
            <ToggleGroup
              type="single"
              value={item.sellingUnit}
              onValueChange={(value) => {
                if ((value === 'box' || value === 'strip') && typeof onChangeUnit === 'function') {
                  onChangeUnit(value);
                }
              }}
            >
              <ToggleGroupItem value="strip">Strip</ToggleGroupItem>
              <ToggleGroupItem value="box">Box</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 sm:h-8 sm:w-8 rounded-lg flex-shrink-0"
            onClick={() => onUpdateQuantity(item.quantity - 1)}
            disabled={item.quantity <= 1}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <span className="w-10 sm:w-8 text-center font-semibold">{item.quantity}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 sm:h-8 sm:w-8 rounded-lg flex-shrink-0"
            onClick={() => onUpdateQuantity(item.quantity + 1)}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="text-right sm:text-left font-bold text-primary text-base sm:text-sm">
          {formatPKR(item.total)}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 sm:h-8 sm:w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg flex-shrink-0"
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
});
