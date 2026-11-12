import type { AxiosInstance } from 'axios';
import type {
  CategoryDto,
  CategoryInput,
  CustomerCreateInput,
  CustomerDto,
  CustomerUpdateInput,
  ListQuery,
  LocationDto,
  LocationInput,
  Page,
  ProductDto,
  ProductInput,
} from '@eventra/shared';

type Envelope<T> = { data: T };
type ListParams = Partial<Pick<ListQuery, 'q' | 'page' | 'pageSize'>>;

export const listCustomers = async (c: AxiosInstance, params: ListParams = {}) =>
  (await c.get<Envelope<Page<CustomerDto>>>('/customers', { params })).data.data;
export const createCustomer = async (c: AxiosInstance, input: CustomerCreateInput) =>
  (await c.post<Envelope<CustomerDto>>('/customers', input)).data.data;
export const updateCustomer = async (c: AxiosInstance, id: string, input: CustomerUpdateInput) =>
  (await c.put<Envelope<CustomerDto>>(`/customers/${id}`, input)).data.data;

export const listProducts = async (c: AxiosInstance, params: ListParams = {}) =>
  (await c.get<Envelope<Page<ProductDto>>>('/products', { params })).data.data;
export const createProduct = async (c: AxiosInstance, input: ProductInput) =>
  (await c.post<Envelope<ProductDto>>('/products', input)).data.data;
export const updateProduct = async (c: AxiosInstance, id: string, input: ProductInput) =>
  (await c.put<Envelope<ProductDto>>(`/products/${id}`, input)).data.data;

export const listCategories = async (c: AxiosInstance) =>
  (await c.get<Envelope<CategoryDto[]>>('/categories')).data.data;
export const createCategory = async (c: AxiosInstance, input: CategoryInput) =>
  (await c.post<Envelope<CategoryDto>>('/categories', input)).data.data;
export const updateCategory = async (c: AxiosInstance, id: string, input: CategoryInput) =>
  (await c.put<Envelope<CategoryDto>>(`/categories/${id}`, input)).data.data;
export const deleteCategory = async (c: AxiosInstance, id: string): Promise<void> => {
  await c.delete(`/categories/${id}`);
};

export const listLocations = async (c: AxiosInstance) =>
  (await c.get<Envelope<LocationDto[]>>('/locations')).data.data;
export const createLocation = async (c: AxiosInstance, input: LocationInput) =>
  (await c.post<Envelope<LocationDto>>('/locations', input)).data.data;
export const updateLocation = async (c: AxiosInstance, id: string, input: LocationInput) =>
  (await c.put<Envelope<LocationDto>>(`/locations/${id}`, input)).data.data;
