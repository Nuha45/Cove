import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);

function storageKey(slug) {
  return `cove-cart:${slug}`;
}

function readCart(slug) {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.productId && item?.name && Number(item.quantity) > 0)
      .map((item) => ({
        productId: String(item.productId),
        name: String(item.name),
        price: Number(item.price) || 0,
        quantity: Math.max(1, Math.min(1000, Math.floor(Number(item.quantity)) || 1)),
        image: item.image || '',
        stockQuantity: Number(item.stockQuantity) || 0,
      }));
  } catch {
    return [];
  }
}

export function CartProvider({ slug, children }) {
  const [items, setItems] = useState(() => (slug ? readCart(slug) : []));

  useEffect(() => {
    setItems(slug ? readCart(slug) : []);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    window.localStorage.setItem(storageKey(slug), JSON.stringify(items));
  }, [slug, items]);

  const value = useMemo(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    function addItem(product, quantity = 1) {
      if (!product?.available || product.stockQuantity < 1) return false;
      const addBy = Math.max(1, Math.min(product.stockQuantity, Math.floor(Number(quantity)) || 1));
      // Decided from the rendered cart, not inside the state updater, so the result is known synchronously.
      const existing = items.find((item) => item.productId === product.id);
      if (existing && Math.min(product.stockQuantity, existing.quantity + addBy) === existing.quantity) {
        return false;
      }
      setItems((current) => {
        const inCart = current.find((item) => item.productId === product.id);
        if (!inCart) {
          return [...current, {
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: addBy,
            image: product.images?.[0] || '',
            stockQuantity: product.stockQuantity,
          }];
        }
        const nextQty = Math.min(product.stockQuantity, inCart.quantity + addBy);
        return current.map((item) => (
          item.productId === product.id
            ? {
              ...item,
              quantity: nextQty,
              price: product.price,
              stockQuantity: product.stockQuantity,
              name: product.name,
              image: product.images?.[0] || item.image,
            }
            : item
        ));
      });
      return true;
    }

    function setQuantity(productId, quantity) {
      setItems((current) => current.flatMap((item) => {
        if (item.productId !== productId) return [item];
        const next = Math.min(item.stockQuantity || 1000, Math.max(0, Math.floor(Number(quantity)) || 0));
        if (next < 1) return [];
        return [{ ...item, quantity: next }];
      }));
    }

    // `latest` maps productId to the shop's current product, or null when it is no longer sold.
    // Items missing from `latest` could not be checked and are left as they are.
    function syncItems(latest) {
      const changes = { priceChanged: [], removed: [], reduced: [] };
      const next = items.flatMap((item) => {
        if (!Object.prototype.hasOwnProperty.call(latest, item.productId)) return [item];
        const product = latest[item.productId];
        if (!product?.available || product.stockQuantity < 1) {
          changes.removed.push(item.name);
          return [];
        }
        if (product.price !== item.price) changes.priceChanged.push(product.name);
        const quantity = Math.min(item.quantity, product.stockQuantity);
        if (quantity < item.quantity) changes.reduced.push(product.name);
        return [{
          ...item,
          name: product.name,
          price: product.price,
          stockQuantity: product.stockQuantity,
          image: product.images?.[0] || item.image,
          quantity,
        }];
      });
      setItems(next);
      return changes;
    }

    function removeItem(productId) {
      setItems((current) => current.filter((item) => item.productId !== productId));
    }

    function clear() {
      setItems([]);
    }

    return {
      items,
      count,
      subtotal,
      addItem,
      setQuantity,
      syncItems,
      removeItem,
      clear,
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return context;
}
