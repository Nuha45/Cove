import { useState } from 'react';
import { X } from 'lucide-react';
import ProductForm, {
  emptyProductForm,
  formFromProduct,
  productFieldErrors,
  productPayload,
} from './ProductForm';
import { createProduct, updateProduct } from '../../services/productService';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

export default function ProductModal({ product, onClose, onSaved }) {
  const editing = Boolean(product);
  const [form, setForm] = useState(editing ? formFromProduct(product) : emptyProductForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = productFieldErrors(form);
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const payload = productPayload(form);
      const result = editing
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);
      onSaved(result.product, editing ? 'updated' : 'created');
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow">PRODUCT CATALOG</p>
            <h2 id="product-dialog-title">{editing ? 'Edit product' : 'Add a new product'}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <ProductForm
          form={form}
          errors={errors}
          formError={formError}
          submitting={submitting}
          submitLabel={editing ? 'Save changes' : 'Add product'}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
