import { PayinResponse, PaymentDTO, VerifyResponse } from '../dto/initiate.dto';

export interface IPayinProvider {
  initiatePayin(dto: PaymentDTO): Promise<PayinResponse>;

  verifyTransaction(reference: string): Promise<VerifyResponse>;
}
