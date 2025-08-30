import { PayinResponse, PaymentDTO } from '../dto/initiate.dto';

export interface IPayinProvider {
  initiatePayin(dto: PaymentDTO): Promise<PayinResponse>;
}
