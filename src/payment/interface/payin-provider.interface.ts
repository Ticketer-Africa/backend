import {
  PayinResponse,
  PaymentDTO,
  VerifyResponse,
  WithdrawalDTO,
  WithdrawalResponse,
} from '../dto/initiate.dto';

export interface IPayinProvider {
  initiatePayin(dto: PaymentDTO): Promise<PayinResponse>;
  verifyTransaction(reference: string): Promise<VerifyResponse>;
  initiateWithdrawal(dto: WithdrawalDTO): Promise<WithdrawalResponse>;
  fetchBankCodes(): Promise<any>;
}
